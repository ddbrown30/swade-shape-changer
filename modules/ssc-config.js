export const NAME = "swade-shape-changer";

export const TITLE = "SWADE Shape Changer";
export const SHORT_TITLE = "SSC";

export const PATH = "modules/swade-shape-changer";


export const DEFAULT_CONFIG = {
    templates: {
        shapesTab: `${PATH}/templates/shapes-tab.hbs`,
        changeShapeDialog: `${PATH}/templates/change-shape-dialog.hbs`,
    },
    changeTypes: {
        base: "SSC.ChangeShapeDialog.ShapeChangeTypes.Base",
        polymorph: "SSC.ChangeShapeDialog.ShapeChangeTypes.Polymorph"
    },
}

export const FLAGS = {
    shapes: "shapes",
    originalToken: "originalToken",
    isChangeSource: "isChangeSource",
}

export const SETTING_KEYS = {
    ignoreWoundWarning: "ignoreWoundWarning",
}

