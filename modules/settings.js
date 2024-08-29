import * as SSC_CONFIG from "./ssc-config.js";
import { ShapeChanger } from "./shape-changer.js";
import { Utils } from "./utils.js";

export function registerSettings() {

    Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.ignoreWoundWarning, {
        scope: "client",
        type: Boolean,
        default: false,
        config: false
    });
}