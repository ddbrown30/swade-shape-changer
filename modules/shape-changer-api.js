import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

/**
 * API functions for interacting with Coins
 */
export class ShapeChangerAPI {

    /* -------------------------------------------- */
    /*                      API                     */
    /* -------------------------------------------- */


    /**
     * Opens the dialog for executing a shape change
     * @param {Token} tokenToTransform //The token to transform
     */
    static async changeShape(tokenToTransform) {
        let shapePower = tokenToTransform.actor.items.find((item) => item.type == "power" && (item.system.swid == "shape-change" || item.name == "Shape Change"));
        if (!shapePower) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapeChange"));
            return;
        }

        let shapes = shapePower.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? [];
        if (shapes.length == 0) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapes"));
            return;
        }

        let shapeNames = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeNames.push({ name: shapeActor.name, label: shapeActor.name, shapeActor: shapeActor });
        }

        shapeNames.sort((a, b) => a.name.localeCompare(b.name));

        let shape = shapeNames[0].key;
        let changeType = "base";

        const templateData = { shapes: shapeNames, shape: shape, changeTypes: SSC_CONFIG.DEFAULT_CONFIG.changeTypes, changeType: changeType };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.changeShapeDialog, templateData);

        //Local function to process the dialog confirmation
        async function handleChangeDialogConfirm(html, raise) {
            //Check if we're trying to shape change a token that was already changed
            let originalTokenId = tokenToTransform.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
            if (originalTokenId) {
                let originalToken = canvas.tokens.get(originalTokenId);
                if (originalToken) {
                    //This is an existing shape change. Revert back to the original token and then use that token moving forward
                    await ShapeChangerAPI.revertShape(tokenToTransform);
                    tokenToTransform = originalToken;
                }
            }

            const shapeChoice = $(html).find("select[name='shape'").find("option:selected");
            let selectedShape = shapeNames.find((s) => s.name == shapeChoice.val());

            const typeChoice = $(html).find("select[name='changeType'").find("option:selected").val();
            const animalSmarts = $(html).find("input[id='animal-smarts'");

            ShapeChanger.createTokenWithActor(tokenToTransform, selectedShape.shapeActor, typeChoice, animalSmarts[0].checked, raise);
        }

        new Dialog({
            title: game.i18n.localize("SSC.ChangeShapeDialog.Title"),
            content: content,
            buttons: {
                success: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.SuccessButtonName"),
                    callback: async (html) => {
                        handleChangeDialogConfirm(html, false);
                    }
                },
                raise: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.RaiseButtonName"),
                    callback: async (html) => {
                        handleChangeDialogConfirm(html, true);
                    }
                },
                cancel: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.CancelButtonName")
                }
            }
        }).render(true)
    }

    /**
     * Reverts a token back to its original form
     * @param {Token} createdToken //The token to revert
     */
    static async revertShape(createdToken) {
        let createdActor = createdToken.actor;
        let originalTokenId = createdToken.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
        if (!originalTokenId) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NotAChangedToken"));
            return;
        }

        let originalToken = canvas.tokens.get(originalTokenId);
        if (!originalToken) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.OriginalTokenNotFound"));
            return;
        }

        let originalActor = originalToken.actor;

        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalToken.id,
            x: createdToken.x,
            y: createdToken.y,
            "hidden": false
        }]);

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
        if (createdToken.combatant) {
            await createdToken.combatant.combat.createEmbeddedDocuments("Combatant", [{
                tokenId: originalToken.id,
                sceneId: originalToken.parent.id,
                actorId: originalToken.actorId,
                initiative: createdToken.combatant.initiative,
                flags: createdToken.combatant.flags
            }]);

            await createdToken.combatant.combat.deleteEmbeddedDocuments("Combatant", [createdToken.combatant.id]);
        }

        //Delete the created token
        await canvas.scene.deleteEmbeddedDocuments("Token", [createdToken.id], {skipDialog: true});
    }
}