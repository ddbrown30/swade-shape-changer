import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class ShapeChanger {

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} originalToken //The token being transformed
     * @param {Actor} actorToCreate //The actor to copy
     * @param {String} typeChoice //The type of shape change (base or polymorph)
     * @param {Boolean} animalSmarts //If true, the smarts on the new actor wil be marked as animal
     * @param {Boolean} raise //If true, make modifications as if the power was cast with a raise
     */
    static async changeTokenIntoActor(originalToken, actorToCreate, typeChoice, animalSmarts, raise) {
        const originalActor = originalToken.actor;
        const newTokenDoc = await actorToCreate.getTokenDocument({
            x: originalToken.x,
            y: originalToken.y,
            disposition: originalToken.document.disposition,
            name: originalToken.document.name,
            displayName: originalToken.document.displayName,
            "sight.enabled": originalToken.document.sight.enabled,
            "delta.ownership": originalToken.actor.ownership, //We want to make sure that the owners of the original token own the new one too
            actorLink: false, //We always want to unlink the actor so that we don't modify the original
        });

        //Mark the token as a shape change source so that we warn the user if they try to delete it
        await originalToken.document.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, true);

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
        let itemsToRemove = createdActor.items.filter(item => {
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        });

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

        //Now copy over the required items from the original actor

        //Edges, hindrances, and powers are carried over
        let itemsToAdd = originalActor.items.filter(item =>
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        );

        //Smarts and spirit linked skills are carried over
        itemsToAdd = itemsToAdd.concat(originalActor.items.filter(item =>
            item.type == "skill" && (item.system.attribute == "spirit" || item.system.attribute == "smarts")
        ));

        createdActor.createEmbeddedDocuments("Item", itemsToAdd, { render: false, renderSheet: false });

        //Copy over any temporary effects
        //We're not copying permanent effects as there is a high chance that we don't want them. If someone wants them, they can drag them over manually
        let effectsToAdd = originalActor.effects.filter(effect => effect.isTemporary);
        createdActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd);

        //The created actor keeps their smarts, spirit, and wounds
        let actorUpdateData = {
            "system.attributes.smarts": originalActor.system.attributes.smarts,
            "system.attributes.spirit": originalActor.system.attributes.spirit,
            "system.bennies.value": originalActor.system.bennies.value,
            "system.wounds": originalActor.system.wounds,
            "system.fatigue": originalActor.system.fatigue,
            "system.details.autoCalcToughness": true,
            "system.details.autoCalcParry": true
        };

        if (animalSmarts) {
            updateDatafoundry.utils.mergeObject(actorUpdateData, { "system.attributes.smarts.animal": true });
        }

        //On a raise, we boost strength and vigor
        if (typeChoice == "base" && raise) {
            foundry.utils.mergeObject(actorUpdateData, {
                "system.attributes.strength.die.sides": (createdActor.system.attributes.strength.die.sides + 2),
                "system.attributes.vigor.die.sides": (createdActor.system.attributes.vigor.die.sides + 2)
            });
        }

        await createdActor.update(actorUpdateData);

        //Record our original token so we can use it to revert later
        await createdToken.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken, originalToken.id);

        //The new token takes the place of the old in the combat tracker
        await ShapeChanger.swapTokensInCombat(originalToken, createdToken);

        if (!Utils.getSetting(SSC_CONFIG.SETTING_KEYS.ignoreWoundWarning)) {
            //Check if we have any effects that are modifying the max wounds and warn the user if so
            let hasMaxWoundChange = false;
            for (let effect of originalActor.appliedEffects) {
                for (let change of effect.changes) {
                    if (change.key == "system.wounds.max") {
                        hasMaxWoundChange = true;
                        break;
                    }
                }
            }

            if (hasMaxWoundChange) {
                new Dialog({
                    title: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Title"),
                    content: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Body"),
                    buttons: {
                        ok: { label: game.i18n.localize("SSC.Okay") },
                        ignore: {
                            label: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.IgnoreButton"),
                            callback: async (html) => {
                                Utils.setSetting(SSC_CONFIG.SETTING_KEYS.ignoreWoundWarning, true);
                            }
                        }
                    },
                    default: "ok"
                }).render(true);
            }
        }
    }

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} createdToken //The token being reverted
     * @param {Token} originalToken //The original source token to revert to
     */
    static async revertChangeForToken(createdToken, originalToken) {
        let createdActor = createdToken.actor;
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
            "system.fatigue.value": createdActor.system.fatigue.value
        };
        await originalActor.update(actorUpdateData);

        //We're no longer a change source
        await originalToken.document.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, false);

        //Remove all the existing temporary effects from the original actor
        //We're going to copy all the ones from the created actor and we're assuming that is the correct state
        let effectsToDelete = originalActor.effects.filter(effect => effect.isTemporary);
        const effectIdsToDelete = effectsToDelete.map(e => e.id);
        await originalActor.deleteEmbeddedDocuments("ActiveEffect", effectIdsToDelete);

        let effectsToAdd = createdActor.effects.filter(effect => effect.isTemporary);
        await originalActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd);

        //Swap the combatants back
        await ShapeChanger.swapTokensInCombat(createdToken, originalToken);

        //Delete the created token
        await canvas.scene.deleteEmbeddedDocuments("Token", [createdToken.id], {skipDialog: true});
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
}
