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
     * @param {Token} sourceToken //The token that is the source of the shape change
     */
    static async changeShape(sourceToken) {
        if (!sourceToken) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoTokenSelected"));
            return;
        }

        let shapePowers = sourceToken.actor.items.filter((item) => Utils.isShapeChangePower(item));
        if (!shapePowers) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapeChange"));
            return;
        }

        let shapes = [];
        for (let shapePower of shapePowers) {
            shapes = shapes.concat(shapePower.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? []);
        }

        if (shapes.length == 0) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapes"));
            return;
        }
        
        //Remove duplicates
        shapes = [...new Set(shapes)];

        let shapeNames = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeNames.push({ name: shapeActor.name, label: shapeActor.name, uuid: shape });
        }
        shapeNames.sort((a, b) => a.name.localeCompare(b.name));

        let targets = [];
        let targetTokens = [];
        if (game.user.targets.size > 1) {
            for (const target of game.user.targets) {
                targets.push({ name: target.name, label: target.name, token: target });
            }
            targets.sort((a, b) => a.name.localeCompare(b.name));

            const allTargetsString = game.i18n.localize("SSC.ChangeShapeDialog.TargetSelectionAll");
            targets.unshift({ name: allTargetsString, label: allTargetsString, token: null });
        } else {
            targetTokens.push(game.user.targets.size == 1 ? game.user.targets.first(): sourceToken);
        }

        const templateData = {
            shapes: shapeNames,
            shape: shapeNames[0].name,
            targets: targets,
            target: targets[0]?.name,
            changeTypes: SSC_CONFIG.DEFAULT_CONFIG.changeTypes,
            changeType: "base" };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.changeShapeDialog, templateData);

        //Local function to process the dialog confirmation
        async function handleChangeDialogConfirm(html, raise) {
            //Check if we're trying to shape change a token that was already changed
            let originalTokenId = sourceToken.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
            if (originalTokenId) {
                let originalToken = canvas.tokens.get(originalTokenId);
                if (originalToken) {
                    //This is an existing shape change. Revert back to the original token and then use that token moving forward
                    await ShapeChangerAPI.revertShape(sourceToken);
                    sourceToken = originalToken;
                }
            }

            const shapeChoice = $(html).find("select[name='shape'").find("option:selected");
            let selectedShape = shapeNames.find((s) => s.name == shapeChoice.val());
            
            if (game.user.targets.size > 1) {
                const targetChoice = $(html).find("select[name='target'").find("option:selected");
                let target = targets.find((t) => t.name == targetChoice.val());
                if (target.token == null) {
                    targetTokens = targets.filter(t => t.token != null).map( t => t.token);
                } else {
                    targetTokens.push(target.token);
                }
            }

            const typeChoice = $(html).find("select[name='changeType'").find("option:selected").val();
            const animalSmarts = $(html).find("input[id='animal-smarts'");

            for (let targetToken of targetTokens) {
                await game.swadeShapeChanger.socket.executeAsGM(
                    "changeTokenIntoActor",
                    targetToken.scene.id,
                    targetToken.id,
                    selectedShape.uuid,
                    typeChoice,
                    animalSmarts[0].checked,
                    raise);
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
        if (!createdToken) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoTokenSelected"));
            return;
        }

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

        await game.swadeShapeChanger.socket.executeAsGM("revertChangeForToken", createdToken.scene.id, createdToken.id, originalToken.id);
    }
}