import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class ShapeChanger {

    static AddingItems = false;

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} originalToken //The token being transformed
     * @param {Actor} actorToCreate //The actor to copy
     * @param {String} typeChoice //The type of shape change (base or polymorph)
     * @param {Boolean} animalSmarts //If true, the smarts on the new actor wil be marked as animal
     * @param {Boolean} raise //If true, make modifications as if the power was cast with a raise
     */
    static async changeTokenIntoActor(sceneId, originalTokenId, actorToCreateId, typeChoice, animalSmarts, longDuration, raise) {
        let originalToken = game.scenes.find(s => s.id == sceneId).tokens.find(t => t.id == originalTokenId);
        const originalActor = originalToken.actor;
        const actorToCreate = await fromUuid(actorToCreateId);

        const newTokenDoc = await actorToCreate.getTokenDocument({
            x: originalToken.x,
            y: originalToken.y,
            disposition: originalToken.disposition,
            name: originalToken.name,
            displayName: originalToken.displayName,
            "sight.enabled": originalToken.sight.enabled,
            "delta.ownership": originalToken.actor.ownership, //We want to make sure that the owners of the original token own the new one too
            actorLink: false, //We always want to unlink the actor so that we don't modify the original
        });

        newTokenDoc.actor.type = originalToken.actor.type;

        //Mark the token as a shape change source so that we warn the user if they try to delete it
        await originalToken.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, true);

        let createdToken = (await canvas.scene.createEmbeddedDocuments("Token", [newTokenDoc.toObject(false)]))[0];
        let createdActor = createdToken.actor;

        //Hide the original token and move it to the side
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalToken.id,
            x: originalToken.x - canvas.grid.size,
            y: originalToken.y - canvas.grid.size,
            "hidden": true
        }], { animate: false });


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
            await game.succ.addCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE, createdToken, { duration });
        }

        //Record our original token so we can use it to revert later
        await createdToken.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken, originalToken.id);

        //The new token takes the place of the old in the combat tracker
        await ShapeChanger.swapTokensInCombat(originalToken, createdToken);

        return createdToken;
    }

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} createdToken //The token being reverted
     * @param {Token} originalToken //The original source token to revert to
     */
    static async revertChangeForToken(sceneId, createdTokenId, originalTokenId) {
        let createdToken = game.scenes.find(s => s.id == sceneId).tokens.find(t => t.id == createdTokenId);
        let createdActor = createdToken.actor;
        let originalToken = game.scenes.find(s => s.id == sceneId).tokens.find(t => t.id == originalTokenId);
        let originalActor = originalToken.actor;

        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalToken.id,
            x: createdToken.x,
            y: createdToken.y,
            "hidden": false
        }], { animate: false });

        let actorUpdateData = {
            "system.bennies.value": createdActor.system.bennies.value,
            "system.wounds.value": createdActor.system.wounds.value,
            "system.fatigue.value": createdActor.system.fatigue.value,
            "system.powerPoints": createdActor.system.powerPoints
        };
        await originalActor.update(actorUpdateData);

        //We're no longer a change source
        await originalToken.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, false);

        //Remove all the existing temporary effects from the original actor
        //We're going to copy all the ones from the created actor and we're assuming that is the correct state
        let effectsToDelete = originalActor.effects.filter(effect => effect.isTemporary);
        const effectIdsToDelete = effectsToDelete.map(e => e.id);
        await originalActor.deleteEmbeddedDocuments("ActiveEffect", effectIdsToDelete, { render: false });

        //We're removing the shape change condition here rather than just not adding it below so that it will process macros and output to chat
        await game.succ.removeCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE, createdToken);

        let effectsToAdd = createdActor.effects.filter(effect => effect.isTemporary);
        await originalActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { render: false });

        //Swap the combatants back
        await ShapeChanger.swapTokensInCombat(createdToken, originalToken);

        //Delete the created token
        await canvas.scene.deleteEmbeddedDocuments("Token", [createdToken.id], { skipDialog: true });
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

    static async validateFinalValues(targetToken, createdToken) {
        const createdActor = createdToken.actor ?? game.scenes.get(targetToken.scene.id).tokens.get(createdToken._id).actor;
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
}
