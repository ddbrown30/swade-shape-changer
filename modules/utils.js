import * as SSC_CONFIG from "./ssc-config.js";

/**
 * Provides helper methods for use elsewhere in the module
 */
export class Utils {

    /**
     * Get a single setting using the provided key
     * @param {*} key 
     * @returns {Object} setting
     */
    static getSetting(key) {
        return game.settings.get(SSC_CONFIG.NAME, key);
    }

    /**
     * Sets a single game setting
     * @param {*} key 
     * @param {*} value 
     * @param {*} awaitResult 
     * @returns {Promise | ClientSetting}
     */
    static async setSetting(key, value, awaitResult=false) {
        if (!awaitResult) {
            return game.settings.set(SSC_CONFIG.NAME, key, value);
        }

        await game.settings.set(SSC_CONFIG.NAME, key, value).then(result => {
            return result;
        }).catch(rejected => {
            throw rejected;
        });
    }

    /**
     * Register a single setting using the provided key and setting data
     * @param {*} key 
     * @param {*} metadata 
     * @returns {ClientSettings.register}
     */
    static registerSetting(key, metadata) {
        return game.settings.register(SSC_CONFIG.NAME, key, metadata);
    }

    /**
     * Register a menu setting using the provided key and setting data
     * @param {*} key 
     * @param {*} metadata 
     * @returns {ClientSettings.registerMenu}
     */
    static registerMenu(key, metadata) {
        return game.settings.registerMenu(SSC_CONFIG.NAME, key, metadata);
    }

    /**
     * Loads templates for partials
     */
    static async loadTemplates() {
        const templates = [
        ];
        await loadTemplates(templates)
    }

    static showNotification(type, message, options) {
        const msg = `${SSC_CONFIG.SHORT_TITLE} | ${message}`;
        return ui.notifications[type](msg, options);
    }
    
    static consoleMessage(type, {objects=[], message="", subStr=[]}) {
        const msg = `${SSC_CONFIG.TITLE} | ${message}`;
        const params = [];
        if (objects && objects.length) params.push(objects);
        if (msg) params.push(msg);
        if (subStr && subStr.length) params.push(subStr);
        return console[type](...params);
    }

    static hasModuleFlags(obj) {
        if (!obj.flags) {
            return false;
        }

        return obj.flags[SSC_CONFIG.NAME] ? true : false;
    }

    static getModuleFlag(obj, flag) {
        if (!Utils.hasModuleFlags(obj)) {
            return;
        }

        return obj.flags[SSC_CONFIG.NAME][flag];
    }

    static isShapeChangePower(item) {
        if (!item || item.type != "power") {
            return false;
        }

        return item.system.swid == "shape-change" ||
        item.system.swid == "baleful-polymorph" ||
        item.system.swid == "monstrous-shape-change" ||
        item.name.toLowerCase() == "shape change" ||
        item.name.toLowerCase() == "baleful polymorph" ||
        item.name.toLowerCase() == "monstrous shape change";
    }

    static useSUCC() {
        return game.modules.get('succ')?.active &&
        Utils.getSetting(SSC_CONFIG.SETTING_KEYS.useSUCC) &&
        game.succ.getCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE);
    }

    static validateSUCCConfig() {
        if (Utils.getSetting(SSC_CONFIG.SETTING_KEYS.useSUCC) &&
            !game.succ.getCondition(SSC_CONFIG.SUCC_SHAPE_CHANGE)) {
            //SUCC is enabled but the shape change condition is not
            //Show a warning to the user and allow them to disable the option
            new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize("SSC.SUCCWarning.Title") },
                content: game.i18n.localize("SSC.SUCCWarning.Body"),
                position: { width: 500 },
                classes: ["ssc-dialog"],
                buttons: [
                    {
                        action: "ok",
                        label: game.i18n.localize("SSC.Okay"),
                        default: true
                    },
                    {
                        action: "openOptions",
                        label: game.i18n.localize("SSC.SUCCWarning.SUCCOptionsButton"),
                        callback: async (event, button, dialog) => { game.settings.sheet.render(true, {activeCategory: "succ"}); }
                    },
                    {
                        action: "disable",
                        label: game.i18n.localize("SSC.SUCCWarning.DisableSupportButton"),
                        callback: async (event, button, dialog) => {
                            Utils.setSetting(SSC_CONFIG.SETTING_KEYS.useSUCC, false);
                            foundry.applications.api.DialogV2.prompt({
                                window: { title: game.i18n.localize("SSC.SUCCDisableConfirmation.Title") },
                                content: game.i18n.localize("SSC.SUCCDisableConfirmation.Body"),
                                position: { width: 400 }
                            });
                        }
                    }
                ]
            }).render(true);
        }
    }

    /**
     * Returns true for effect change keys that modify values that we need to delete during a shape change
     */
    static shouldDeleteKey(key) {
        return key == "system.wounds.max" ||
        key == "system.fatigue.max" ||
        key == "system.bennies.max";
    }
}