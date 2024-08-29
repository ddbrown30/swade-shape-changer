import { Utils } from "./utils.js";
import { registerSettings } from "./settings.js";
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
            game.swadeShapeChanger.createTokenWithActor = ShapeChangerAPI.createTokenWithActor;

            Utils.loadTemplates();
            registerSettings();
        });

        Hooks.on("ready", () => {
            ShapeChanger.onReady();
        });

        /* -------------------------------------------- */
        /*                    Item                    */
        /* -------------------------------------------- */
        Hooks.on("preUpdateItem", ((app, html, data) => {
            ShapeChanger.onPreUpdateItem(app, html, data);
          }))

        Hooks.on("renderItemSheet", (app, html, data) => {
            ShapeChanger.onRenderItemSheet(app, html, data);
        });

        /* -------------------------------------------- */
        /*                    Drop                      */
        /* -------------------------------------------- */

        Hooks.on("dropActorSheetData", async (actor, sheet, data) => {
            ShapeChanger.onDropActorSheetData(actor, sheet, data);
        });

    }
}