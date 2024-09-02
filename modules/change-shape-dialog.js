import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api

/**
 * Dialog for configuring and executing a shape change
 */
export class ChangeShapeDialog extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
        id: "change-shape-dialog",
        tag: "form",
        classes: ["change-shape-dialog"],
        window: { title: "SSC.ChangeShapeDialog.Title" },
        actions: {
            success: function (event, button) { ChangeShapeDialog.handleChangeDialogConfirm(this, false); },
            raise: function (event, button) { ChangeShapeDialog.handleChangeDialogConfirm(this, true); },
            cancel: function (event, button) { this.close(); }
        },
    };

    static PARTS = {
        form: {
            template: SSC_CONFIG.DEFAULT_CONFIG.templates.changeShapeDialog,
        }
    };

    async _prepareContext(_options) {
        let sourceToken = this.document.object;
        let shapePowers = sourceToken.actor.items.filter((item) => Utils.isShapeChangePower(item));
        if (!shapePowers) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapeChange"));
            this.close();
            return;
        }

        let shapes = [];
        for (let shapePower of shapePowers) {
            shapes = shapes.concat(shapePower.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? []);
        }

        if (shapes.length == 0) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapes"));
            this.close();
            return;
        }

        //Remove duplicates
        shapes = [...new Set(shapes)];

        this.shapeNames = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            this.shapeNames.push({ name: shapeActor.name, label: shapeActor.name, uuid: shape });
        }
        this.shapeNames.sort((a, b) => a.name.localeCompare(b.name));

        this.targets = [];
        this.targetTokens = [];
        if (game.user.targets.size > 1) {
            for (const target of game.user.targets) {
                this.targets.push({ name: target.name, label: target.name, token: target });
            }
            this.targets.sort((a, b) => a.name.localeCompare(b.name));

            const allTargetsString = game.i18n.localize("SSC.ChangeShapeDialog.TargetSelectionAll");
            this.targets.unshift({ name: allTargetsString, label: allTargetsString, token: null });
        } else {
            this.targetTokens.push(game.user.targets.size == 1 ? game.user.targets.first() : sourceToken);
        }

        this.changeType = this.changeType ?? "base";

        return {
            shapes: this.shapeNames,
            shape: this.shapeNames[0].name,
            targets: this.targets,
            target: this.targets[0]?.name,
            changeTypes: SSC_CONFIG.DEFAULT_CONFIG.changeTypes,
            changeType: this.changeType,
            useSUCC: Utils.useSUCC()
        };
    };

    /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
    _onRender(context, options) {
        const changeTypeSelector = this.element.querySelectorAll('select[name="changeType"]');
        changeTypeSelector[0].addEventListener("change", event => {
            const selection = $(event.target).find("option:selected");
            this.changeType = selection.val();
            this.render();
        });
    }

    static async handleChangeDialogConfirm(dialog, raise) {
        if (!game.users.activeGM) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoActiveGM"));
            return;
        }

        const shapeChoice = $(dialog.element).find("select[name='shape'").find("option:selected");
        let selectedShape = dialog.shapeNames.find((s) => s.name == shapeChoice.val());

        if (game.user.targets.size > 1) {
            const targetChoice = $(dialog.element).find("select[name='target'").find("option:selected");
            let target = dialog.targets.find((t) => t.name == targetChoice.val());
            if (target.token == null) {
                for (let target of dialog.targets) {
                    if (target.token != null) {
                        dialog.targetTokens.push(target.token);
                    }
                }
            } else {
                dialog.targetTokens.push(target.token);
            }
        }

        //Check if we're trying to shape change a token that was already changed
        for (let targetToken of dialog.targetTokens) {
            let originalTokenId = targetToken.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
            if (originalTokenId) {
                let originalToken = canvas.tokens.get(originalTokenId);
                if (originalToken) {
                    //This is an existing shape change. Revert back to the original token and then use that token moving forward
                    await ShapeChangerAPI.revertShape(targetToken);
                    sourceToken = targetToken == sourceToken ? originalToken : sourceToken;
                    dialog.targetTokens = dialog.targetTokens.filter(t => t.id != targetToken.id);
                    dialog.targetTokens.push(originalToken);
                }
            }
        }

        const animalSmarts = $(dialog.element).find("input[id='animal-smarts'");
        const longDuration = $(dialog.element).find("input[id='duration'");

        for (let targetToken of dialog.targetTokens) {
            const createdToken = await game.swadeShapeChanger.socket.executeAsGM(
                "changeTokenIntoActor",
                targetToken.scene.id,
                targetToken.id,
                selectedShape.uuid,
                dialog.changeType,
                !!(animalSmarts?.length && animalSmarts[0].checked),
                !!(longDuration?.length && longDuration[0].checked),
                raise);

            ShapeChanger.validateFinalValues(targetToken, createdToken);
        }

        dialog.close();
    }
}