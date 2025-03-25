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

    if (game.modules.get('sequencer')?.active) {
        Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.useSequencer, {
            name: "SSC.Settings.UseSequencerName",
            hint: "SSC.Settings.UseSequencerHint",
            scope: "world",
            type: Boolean,
            config: true,
            default: true,
        });
        
        Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.changeAnim, {
            name: "SSC.Settings.SequencerAnimName",
            hint: "SSC.Settings.SequencerAnimHint",
            scope: "world",
            type: String,
            config: true,
            default: "jb2a.cast_generic.earth.01.browngreen.0",
        });
        
        Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.changeDelay, {
            name: "SSC.Settings.SequencerDelayName",
            hint: "SSC.Settings.SequencerDelayHint",
            scope: "world",
            type: Number,
            config: true,
            default: 800,
        });
        
        Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.animScale, {
            name: "SSC.Settings.SequencerScaleName",
            hint: "SSC.Settings.SequencerScaleHint",
            scope: "world",
            type: Number,
            config: true,
            default: 2,
        });
    }
    
    Utils.registerSetting(SSC_CONFIG.SETTING_KEYS.ignoreTcalWarning, {
        scope: "world",
        type: Boolean,
        config: false,
        default: false
    });
}