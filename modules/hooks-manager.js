import { Utils } from "./utils.js";
import { registerSettings } from "./settings.js";
import { Handlers } from "./handlers.js";
import { ShapeChanger } from "./shape-changer.js";
import { ShapeChangerAPI } from "./shape-changer-api.js";
import * as SSC_CONFIG from "./ssc-config.js";

export class HooksManager {
    /**
     * Registers hooks
     */
    static registerHooks() {

        /* ------------------- Init/Ready ------------------- */

        Hooks.on("init", () => {
            game.swadeShapeChanger = game.swadeShapeChanger ?? {};

            // Expose API methods
            game.swadeShapeChanger.changeShape = ShapeChangerAPI.changeShape;
            game.swadeShapeChanger.revertShape = ShapeChangerAPI.revertShape;
            game.swadeShapeChanger.werewolfToHuman = ShapeChangerAPI.werewolfToHuman;
            game.swadeShapeChanger.swapActor = ShapeChangerAPI.swapActor;

            Utils.loadTemplates();
            registerSettings();
        });

        Hooks.once("socketlib.ready", () => {
            game.swadeShapeChanger = game.swadeShapeChanger ?? {};

            game.swadeShapeChanger.socket = socketlib.registerModule(SSC_CONFIG.NAME);
            game.swadeShapeChanger.socket.register("updateCombatant", ShapeChanger.updateCombatant);
            game.swadeShapeChanger.socket.register("changeTokenIntoActor", ShapeChanger.changeTokenIntoActor);
            game.swadeShapeChanger.socket.register("revertChangeForToken", ShapeChanger.revertChangeForToken);
            game.swadeShapeChanger.socket.register("werewolfToHuman", ShapeChanger.werewolfToHuman);
            game.swadeShapeChanger.socket.register("swapTokenToActor", ShapeChanger.swapTokenToActor);
        });

        Hooks.once("succReady", () => {
            Utils.validateSUCCConfig();
        });

        Hooks.on("ready", () => {
            Handlers.onReady();
        });

        /* -------------------------------------------- */
        /*                    Item                    */
        /* -------------------------------------------- */
        Hooks.on("preUpdateItem", ((item, changes, options, user) => {
            Handlers.onPreUpdateItem(item, changes, options, user);
        }))

        Hooks.on("renderSwadeItemSheetV2", (app, html, data) => {
            if (ShapeChanger.AddingItems){
                //Hack to close all the item sheets that pop up during a shape change
                app.close({force:true});
                return;
            }
            Handlers.onRenderItemSheet(app, html, data);
        });

        Hooks.on("renderChoiceDialog", (app, _html, _data) => {
            if (ShapeChanger.AddingItems){
                //Hack to close the choice dialog that pops up during a shape change
                app.close({force:true});
            }
        });

        /* -------------------------------------------- */
        /*                    Drop                      */
        /* -------------------------------------------- */

        Hooks.on("dropActorSheetData", async (actor, sheet, data) => {
            Handlers.onDropActorSheetData(actor, sheet, data);
        });

        Hooks.on("preDeleteToken", (token, options, _user) => {
            if (!options.skipDialog) {
                const isChangeSource = token.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource);
                const originalToken = token.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
                if (isChangeSource || originalToken) {
                    const content = isChangeSource ? "SSC.DeleteTokenWarning.SourceBody" : "SSC.DeleteTokenWarning.CreatedBody";
                    foundry.applications.api.DialogV2.confirm({
                        window: { title: game.i18n.localize("SSC.DeleteTokenWarning.Title") },
                        content: game.i18n.localize(content),
                        position: { width: 400 },
                        yes: { callback: () => canvas.scene.deleteEmbeddedDocuments("Token", [token.id], { skipDialog: true }) },
                        defaultYes: false
                    });
                    return false;
                }
            }
        });

    }
}