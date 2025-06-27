import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class ShapeChanger {

    static AddingItems = false;

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {String} sceneId //The token being transformed
     * @param {String} originalTokenId //The token being transformed
     * @param {Actor} actorToCreate //The actor to copy
     * @param {String} typeChoice //The type of shape change (base or polymorph)
     * @param {Boolean} animalSmarts //If true, the smarts on the new actor wil be marked as animal
     * @param {Boolean} raise //If true, make modifications as if the power was cast with a raise
     */
    static async changeTokenIntoActor(sceneId, originalTokenId, actorToCreateId, typeChoice, animalSmarts, longDuration, raise) {
        const scene = game.scenes.find(s => s.id == sceneId);
        let originalTokenDoc = scene.tokens.find(t => t.id == originalTokenId);
        const originalActor = originalTokenDoc.actor;
        const actorToCreate = actorToCreateId.startsWith("Compendium") ? await game.tcal.importTransientActor(actorToCreateId) : await fromUuid(actorToCreateId);

        const newTokenDoc = await actorToCreate.getTokenDocument({
            x: originalTokenDoc.x,
            y: originalTokenDoc.y,
            disposition: originalTokenDoc.disposition,
            name: originalTokenDoc.name,
            displayName: originalTokenDoc.displayName,
            "sight.enabled": originalTokenDoc.sight.enabled,
            "delta.ownership": originalTokenDoc.actor.ownership, //We want to make sure that the owners of the original token own the new one too
            actorLink: false, //We always want to unlink the actor so that we don't modify the original
        });

        newTokenDoc.actor.type = originalTokenDoc.actor.type;

        await ShapeChanger.playSequencerAnimation(scene, originalTokenDoc, newTokenDoc);

        //Mark the token as a shape change source so that we warn the user if they try to delete it
        await originalTokenDoc.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, true);

        //Hide the original token and move it to the side
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalTokenDoc.id,
            x: newTokenDoc.x - (canvas.grid.sizeX * originalTokenDoc.width * originalTokenDoc.texture.scaleX),
            y: newTokenDoc.y - (canvas.grid.sizeY * originalTokenDoc.height * originalTokenDoc.texture.scaleY),
            "hidden": true
        }], { animate: false });

        let createdTokenDoc = (await canvas.scene.createEmbeddedDocuments("Token", [newTokenDoc.toObject()]))[0];
        let createdActor = createdTokenDoc.actor;

        //The shape change power retains the edges, hindrances, powers, and smarts and spirit linked skills of the original form
        //We need to delete all of those from the created actor and then copy over the ones from the original actor
        //We skip anything marked as grantedBy as those will be removed or granted again automatically if needed

        //Edges, hindrances, and powers are not kept
        let itemsToRemove = createdActor.items.filter(item =>
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        );

        //Smarts and spirit linked skills are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "skill" && (item.system.attribute == "spirit" || item.system.attribute == "smarts")
        ));

        //Resilient and Very Resilient are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "ability" && (item.system.swid.includes("resilient") || item.name.toLowerCase().includes("resilient"))
        ));

        //Innate powers are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "ability" && (item.system.swid.includes("innate-power") || item.name.toLowerCase().includes("innate power"))
        ));

        for (let item of itemsToRemove) {
            await item.delete();
        }

        //We've removed everything we're going to remove from the new actor so check if we still have any AEs that modify unsupported values and remove them
        let effects = createdActor.appliedEffects.filter(ae => ae.changes.find(c => Utils.shouldDeleteKey(c.key)));
        for (let effect of effects) {
            effect.changes = effect.changes.filter(c => !Utils.shouldDeleteKey(c.key));
            if (effect.changes.length == 0) {
                await effect.delete();
            } else {
                await effect.update({ _id: undefined, ...effect });
            }
        }

        //Now copy over the required items from the original actor

        //Edges, hindrances, and powers are carried over
        let itemsToAdd = originalActor.items.filter(item =>
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        );

        //Smarts and spirit linked skills are carried over
        itemsToAdd = itemsToAdd.concat(originalActor.items.filter(item =>
            item.type == "skill" && (item.system.attribute == "spirit" || item.system.attribute == "smarts")
        ));

        ShapeChanger.AddingItems = true; //Hack we use to deal with all the pop ups that happen during this step
        await createdActor.createEmbeddedDocuments("Item", itemsToAdd, { render: false, renderSheet: false });
        ShapeChanger.AddingItems = false;

        //Copy over any temporary effects
        //We're not copying permanent effects as there is a high chance that we don't want them. If someone wants them, they can drag them over manually
        let effectsToAdd = originalActor.effects.filter(effect => effect.isTemporary);
        await createdActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { render: false });

        //The created actor keeps their smarts, spirit, and wounds
        let actorUpdateData = {
            name: originalActor.name,
            "system.attributes.smarts": originalActor._source.system.attributes.smarts,
            "system.attributes.spirit": originalActor._source.system.attributes.spirit,
            "system.bennies.value": originalActor.system.bennies.value,
            "system.bennies.max": originalActor._source.system.bennies.max,
            "system.wounds.value": originalActor.system.wounds.value,
            "system.wounds.max": originalActor._source.system.wounds.max,
            "system.fatigue.value": originalActor.system.fatigue.value,
            "system.fatigue.max": originalActor.system._source.fatigue.max,
            "system.powerPoints": originalActor.system.powerPoints,
            "system.details.autoCalcToughness": true,
            "system.details.autoCalcParry": true,
            "system.wildcard": originalActor.wildcard,
        };

        if (animalSmarts) {
            foundry.utils.mergeObject(actorUpdateData, { "system.attributes.smarts.animal": true });
        }

        await createdActor.update(actorUpdateData);

        //On a raise, we boost strength and vigor
        if (typeChoice == "base" && raise) {
            let raiseEffect = {
                name: game.i18n.localize("SSC.RaiseEffectName"),
                img: "icons/magic/control/debuff-energy-hold-levitate-yellow.webp",
                changes: [
                    { key: "system.attributes.strength.die.sides", mode: 2, value: 2 },
                    { key: "system.attributes.vigor.die.sides", mode: 2, value: 2 }
                ]
            };
            await createdActor.createEmbeddedDocuments("ActiveEffect", [raiseEffect], { render: false });
        }

        if (Utils.useSUCC()) {
            let duration = longDuration ? 100 : undefined;
            await game.succ.addCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE, createdTokenDoc, { duration });
        }

        //Record our original token so we can use it to revert later
        await createdTokenDoc.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken, originalTokenDoc.id);

        //The new token takes the place of the old in the combat tracker
        await ShapeChanger.swapTokensInCombat(originalTokenDoc, createdTokenDoc);

        return createdTokenDoc;
    }

    /**
     * Plays the sequencer animation with the correct timing when changing or reverting shape
     * @param {Scene} scene //The token being transformed
     * @param {TokenDocument} originalTokenDoc //The token being transformed
     * @param {TokenDocument} newTokenDoc //The newly created token
     */
    static async playSequencerAnimation(scene, sourceTokenDoc, destTokenDoc) {
        if (!Utils.useSequencer()) {
            return;
        }

        let changeAnim = Utils.getSetting(SSC_CONFIG.SETTING_KEYS.changeAnim);
        let changeDelay = Utils.getSetting(SSC_CONFIG.SETTING_KEYS.changeDelay);
        let animScale = Utils.getSetting(SSC_CONFIG.SETTING_KEYS.animScale);

        if (!Sequencer.Database.entryExists(changeAnim)) {
            return;
        }

        function getCenterPoint(tokenDoc, grid) {
            let { x, y, width, height } = tokenDoc;

            width *= grid.sizeX;
            height *= grid.sizeY;
            return { x: x + (width / 2), y: y + (height / 2) };
        }
        const oldCenterPoint = getCenterPoint(sourceTokenDoc, scene.grid);
        const newCenterPoint = getCenterPoint(destTokenDoc, scene.grid);

        let originalTokenGS = sourceTokenDoc.width * sourceTokenDoc.texture.scaleX;
        let newTokenGS = destTokenDoc.width * destTokenDoc.texture.scaleX;

        let changeSeq = new Sequence();
        changeSeq.effect()
        .file(changeAnim)
        .atLocation(oldCenterPoint, {gridUnits: true})
        .elevation(sourceTokenDoc?.document?.elevation + 1)
        .size(originalTokenGS * 1.5, { gridUnits: true })
        .scale(animScale)
        .fadeIn(250)
        .timeRange(0, changeDelay);

        changeSeq.effect()
        .file(changeAnim)
        .atLocation(newCenterPoint, {gridUnits: true})
        .elevation(destTokenDoc.elevation + 1)
        .size(newTokenGS * 1.5, { gridUnits: true })
        .scale(animScale)
        .fadeOut(250)
        .delay(changeDelay)
        .startTime(changeDelay);

        changeSeq.play();

        const delay = ms => new Promise(res => setTimeout(res, ms));
        await delay(changeDelay);
    }

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {String} createdTokenId //The token being reverted
     * @param {String} originalTokenId //The original source token to revert to
     */
    static async revertChangeForToken(sceneId, createdTokenId, originalTokenId) {
        const scene = game.scenes.find(s => s.id == sceneId);
        let createdTokenDoc = scene.tokens.find(t => t.id == createdTokenId);
        let createdActor = createdTokenDoc.actor;
        let originalTokenDoc = scene.tokens.find(t => t.id == originalTokenId);
        let originalActor = originalTokenDoc.actor;

        originalTokenDoc.x = createdTokenDoc.x;
        originalTokenDoc.y = createdTokenDoc.y;

        await ShapeChanger.playSequencerAnimation(scene, createdTokenDoc, originalTokenDoc);

        let actorUpdateData = {
            "system.bennies.value": createdActor.system.bennies.value,
            "system.wounds.value": createdActor.system.wounds.value,
            "system.fatigue.value": createdActor.system.fatigue.value,
            "system.powerPoints": createdActor.system.powerPoints
        };
        await originalActor.update(actorUpdateData);

        //We're no longer a change source
        await originalTokenDoc.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, false);

        //Remove all the existing temporary effects from the original actor
        //We're going to copy all the ones from the created actor and we're assuming that is the correct state
        let effectsToDelete = originalActor.effects.filter(effect => effect.isTemporary);
        const effectIdsToDelete = effectsToDelete.map(e => e.id);
        await originalActor.deleteEmbeddedDocuments("ActiveEffect", effectIdsToDelete, { render: false });

        if (Utils.useSUCC()) {
            //We're removing the shape change condition here rather than just not adding it below so that it will process macros and output to chat
            await game.succ.removeCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE, createdTokenDoc);
        }

        let effectsToAdd = createdActor.effects.filter(effect => effect.isTemporary);
        await originalActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { render: false });

        //Swap the combatants back
        await ShapeChanger.swapTokensInCombat(createdTokenDoc, originalTokenDoc);

        //Delete the created token
        await canvas.scene.deleteEmbeddedDocuments("Token", [createdTokenDoc.id], { skipDialog: true });

        //Reposition and show the original token
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalTokenDoc.id,
            x: createdTokenDoc.x,
            y: createdTokenDoc.y,
            "hidden": false
        }], { animate: false });
    }

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} currentToken //The token that is currently represented in the combat tracker
     * @param {Token} newToken //The token that should take the place of currentToken in all combat trackers
     */
    static async swapTokensInCombat(currentToken, newToken) {
        let combats = game.combats.filter(c => c.combatants.find(c => c.tokenId == currentToken.id));
        if (combats.length > 0) {
            let combatUpdateData = [];
            for (let combat of combats) {
                let combatants = combat.combatants.filter(c => c.tokenId == currentToken.id);
                let combatantUpdateData = [];
                for (let combatant of combatants) {
                    combatantUpdateData.push({
                        _id: combatant.id,
                        tokenId: newToken.id,
                        sceneId: currentToken.parent.id,
                        actorId: newToken.actor.id,
                    });
                }

                combatUpdateData.push({
                    combatId: combat.id,
                    combatantUpdateData: combatantUpdateData,
                });
            }
            await game.swadeShapeChanger.socket.executeAsGM("updateCombatant", combatUpdateData);
        }
    }

    /**
     * Updates a combatants in a combat
     * @param {*} combatUpdateData //An array of combats and data about combatants to update
     */
    static async updateCombatant(combatUpdateData) {
        for (let data of combatUpdateData) {
            let combat = game.combats.find(c => c.id == data.combatId);
            await combat.updateEmbeddedDocuments("Combatant", data.combatantUpdateData);
        }
    }

    static async validateFinalValues(targetToken, createdTokenDoc) {
        const createdActor = createdTokenDoc.actor ?? game.scenes.get(targetToken.scene.id).tokens.get(createdTokenDoc._id).actor;
        if (targetToken.actor.system.wounds.max != createdActor.system.wounds.max) {
            foundry.applications.api.DialogV2.prompt({
                window: { title: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Title") },
                content: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Body"),
                position: { width: 400 },
                rejectClose: false,
            });
        }
        if (targetToken.actor.system.fatigue.max != createdActor.system.fatigue.max) {
            foundry.applications.api.DialogV2.prompt({
                window: { title: game.i18n.localize("SSC.ChangeShapeDialog.MaxFatigueNotification.Title") },
                content: game.i18n.localize("SSC.ChangeShapeDialog.MaxFatigueNotification.Body"),
                position: { width: 400 },
                rejectClose: false,
            });
        }
    }

    /**
     * Creates a new token copied from the original token and transforms it into a human based on the transformation rules in the Horror Companion
     * @param {Actor} sceneId //The actor to copy
     * @param {String} originalTokenId //The token being transformed
     */
    static async werewolfToHuman(sceneId, originalTokenId) {
        let originalTokenDoc = game.scenes.find(s => s.id == sceneId).tokens.find(t => t.id == originalTokenId);
        const originalActor = originalTokenDoc.actor;
        const actorToCreate = await fromUuid(originalTokenDoc.actor.uuid);

        let transformationAbility = originalActor.items.find((item) => Utils.isTransformationAbility(item));
        let humanTokenImg = "";
        let humanTokenScale = 1;
        if (transformationAbility) {
            humanTokenImg = transformationAbility.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenImg);
            if (humanTokenImg?.length) {
                humanTokenScale = transformationAbility.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenScale) ?? 1;
            } else {
                humanTokenImg = originalTokenDoc.texture.src;
                humanTokenScale = originalTokenDoc.texture.scaleX;
            }
        }

        const newTokenDoc = await actorToCreate.getTokenDocument({
            x: originalTokenDoc.x,
            y: originalTokenDoc.y,
            "sight.enabled": originalTokenDoc.sight.enabled,
            "sight.visionMode": "basic", //Humans only have basic vision. This allows the werewolf token to have infravision enabled
            actorLink: false, //We always want to unlink the actor so that we don't modify the original
            "texture.src": humanTokenImg,
            "texture.scaleX": humanTokenScale,
            "texture.scaleY": humanTokenScale,
        });

        //Mark the token as a change source so that we warn the user if they try to delete it
        await originalTokenDoc.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, true);

        let createdTokenDoc = (await canvas.scene.createEmbeddedDocuments("Token", [newTokenDoc.toObject()]))[0];
        let createdActor = createdTokenDoc.actor;

        //Disable the Heat Seeing and Heat Sensing vision modes on the human form token
        const WEREWOLF_SIGHT_MODES = ["seeHeat", "senseHeat"]
        const humanDetectionModes = createdTokenDoc.detectionModes.map(mode => 
            WEREWOLF_SIGHT_MODES.includes(mode.id) ? { ...mode, enabled: false } : mode
        ).filter(m => m.range != "Infinity" && m.range != 0);
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: createdTokenDoc.id,
            detectionModes: humanDetectionModes,
        }], { animate: false });

        //Hide the original token and move it to the side
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalTokenDoc.id,
            x: originalTokenDoc.x - canvas.grid.size,
            y: originalTokenDoc.y - canvas.grid.size,
            "hidden": true
        }], { animate: false });

        const WEREWOLF_ABILITIES = [
            "biteclaws",
            "cannot-speak",
            "speed",
            "regeneration-slow",
            "infravision",
            "ferocity",
            "weakness"
        ];

        const WEREWOLF_WEAPONS = [
            "natural-bite",
            "natural-claws"
        ];

        let itemsToRemove = [];
        for (let item of createdActor.items) {
            if (item.type == "edge") {
                //Werewolves do not keep their werewolf edges in human form
                if (item.system.requirements.find((r) => r.selector == "werewolf")){
                    itemsToRemove.push(item);
                }
            } else if (item.type == "ability") {
                //Werewolves do not keep their werewolf abilities in human form
                if (WEREWOLF_ABILITIES.find((a) => a == item.system.swid)) {
                    itemsToRemove.push(item);
                }
            } else if (item.type == "hindrance") {
                //Werewolves only have the weakness to silvered weapons while in werewolf form
                if (item.name.toLowerCase().includes("weakness") && item.system.description.toLowerCase().includes("silvered weapons")) {
                    itemsToRemove.push(item);
                }
            }
            else if (item.type == "weapon") {
                //Werewolves do not keep their werewolf weapons in human form
                //This is required as removing the "Bite/Claws" ability does not remove the associated bite and claw weapons from inventory
                if (WEREWOLF_WEAPONS.find((a) => a == item.system.swid)) {
                    itemsToRemove.push(item);
                }
            }
        }

        for (let item of itemsToRemove) {
            await item.delete();
        }

        //Update the name
        let actorUpdateData = {
            name: originalActor.name,
            "system.details.autoCalcToughness": true //In the off chance this was disabled, we need to enable it so the human form is correct
        };

        await createdActor.update(actorUpdateData);

        //Record our original token so we can use it to revert later
        await createdTokenDoc.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken, originalTokenDoc.id);

        //The new token takes the place of the old in the combat tracker
        await ShapeChanger.swapTokensInCombat(originalTokenDoc, createdTokenDoc);

        return createdTokenDoc;
    }

    static validateUuid(uuid) {
        if (game.modules.get("tcal")?.active) return true; //If TCAL is active, we support compendium actors
        if (!uuid.startsWith("Compendium")) return true; //This is not a compendium actor

        //We don't support using actors directly from the compendium
        //Show a warning popup and return
        foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize("SSC.CompendiumWarning.Title") },
            content: game.i18n.localize("SSC.CompendiumWarning.Body"),
            position: { width: 400 },
            rejectClose: false,
        });
        return false;
    }
}
