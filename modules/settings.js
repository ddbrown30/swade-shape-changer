import * as SSC_CONFIG from "./ssc-config.js";
import { ShapeChanger } from "./shape-changer.js";
import { Utils } from "./utils.js";

export function registerSettings() {

    if (game.modules.get('succ')?.active) {
        Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.useSUCC, {
            name: "SSC.Settings.UseSUCCName",
            hint: "SSC.Settings.UseSUCCHint",
            scope: "world",
            type: Boolean,
            config: true,
            default: true,
            onChange: s => { Utils.validateSUCCConfig(); }
        });
    }
}