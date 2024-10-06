import { ChangeShapeDialog } from "./change-shape-dialog.js";
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
        if (!game.user.isTrusted) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NotTrusted"));
            return;
        }

        if (!sourceToken) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoTokenSelected"));
            return;
        }

        new ChangeShapeDialog({ document: sourceToken.document }).render(true);
    }

    /**
     * Reverts a token back to its original form
     * @param {Token} createdToken //The token to revert
     */
    static async revertShape(createdToken) {
        if (!game.user.isTrusted) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NotTrusted"));
            return;
        }

        if (!game.users.activeGM) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoActiveGM"));
            return;
        }

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

        //Close the sheet since the actor will be deleted
        createdToken.actor.sheet.close();

        await game.swadeShapeChanger.socket.executeAsGM("revertChangeForToken", createdToken.scene.id, createdToken.id, originalToken.id);
    }
    
    /**
     * Opens the dialog for executing a werewolf transformation
     * @param {Token} sourceToken //The token that is the source of the shape change
     */
    static async werewolfToHuman(sourceToken) {
        if (!game.user.isTrusted) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NotTrusted"));
            return;
        }

        if (!sourceToken) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoTokenSelected"));
            return;
        }

        foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("SSC.WerewolfToHumanDialog.Title") },
            content: game.i18n.localize("SSC.WerewolfToHumanDialog.Body"),
            position: { width: 400 },
            yes: {
                callback: async (event, button, dialog) =>
                    await game.swadeShapeChanger.socket.executeAsGM(
                        "werewolfToHuman",
                        sourceToken.scene.id,
                        sourceToken.id)
            },
            defaultYes: true
        });
    }
}