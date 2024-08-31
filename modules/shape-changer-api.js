import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

/**
 * API functions for controlling the shape change
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
            shapeNames.push({ name: shapeActor.name, label: shapeActor.name, uuid: shape });
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

            if (game.user.hasPermission('TOKEN_CREATE')) {
                ShapeChanger.changeTokenIntoActor(tokenToTransform.scene.id, tokenToTransform.id, selectedShape.uuid, typeChoice, animalSmarts[0].checked, raise);
            } else {
                await game.swadeShapeChanger.socket.executeAsGM("changeTokenIntoActor", tokenToTransform.scene.id, tokenToTransform.id, selectedShape.uuid, typeChoice, animalSmarts[0].checked, raise);
            }
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

        if (game.user.hasPermission('TOKEN_CREATE')) {
            await ShapeChanger.revertChangeForToken(createdToken.scene.id, createdToken.id, originalToken.id);
        } else {
            await game.swadeShapeChanger.socket.executeAsGM("revertChangeForToken", createdToken.scene.id, createdToken.id, originalToken.id);
        }
    }
}