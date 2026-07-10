import { ShapeChangerAPI } from "./shape-changer-api.js";
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
            success: function () { ChangeShapeDialog.handleChangeDialogConfirm(this, false); },
            raise: function () { ChangeShapeDialog.handleChangeDialogConfirm(this, true); },
            cancel: function () { this.close(); }
        },
    };

    static PARTS = {
        form: {
            template: SSC_CONFIG.DEFAULT_CONFIG.templates.changeShapeDialog,
        }
    };

    async _prepareContext(_options) {
        const sourceToken = this.document.object;

        this.shapeNames = [];

        //Populate our list of shapes from our powers, if any
        await this.getShapesFromPowers(sourceToken);

        //If we've dropped an actor on the dialog, use that as the first entry in the list otherwise show the use string
        if (this.dragDropActor != null) {
            this.shapeNames.unshift({ name: this.dragDropActor.name, label: this.dragDropActor.name, uuid: this.dragDropActor.uuid });
        } else {
            const dragDropString = game.i18n.localize("SSC.ChangeShapeDialog.DragShape");
            this.shapeNames.unshift({ name: dragDropString, label: dragDropString, uuid: null });
        }

        this.targets = [];
        this.targetTokens = [];
        if (game.user.targets.size > 0) {
            for (const target of game.user.targets) {
                this.targets.push({ name: target.name, label: target.name, token: target });
            }
            this.targets.sort((a, b) => a.name.localeCompare(b.name));

            if (game.user.targets.size > 1) {
                const allTargetsString = game.i18n.localize("SSC.ChangeShapeDialog.TargetSelectionAll");
                this.targets.unshift({ name: allTargetsString, label: allTargetsString, token: null });
            }
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
            useSUCC: Utils.useSUCC(),
            actorBrowser: !!game.actorBrowser
        };
    }

    async getShapesFromPowers(sourceToken) {
        const shapePowers = sourceToken.actor.items.filter((item) => Utils.isShapeChangePower(item));
        if (!shapePowers.length) {
            return;
        }

        let shapes = shapePowers.flatMap(shapePower => shapePower.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? []);
        if (shapes.length == 0) {
            return;
        }

        //Remove duplicates
        shapes = [...new Set(shapes)];

        for (const shape of shapes) {
            const shapeActor = await fromUuid(shape);
            if (shapeActor) {
                this.shapeNames.push({ name: shapeActor.name, label: shapeActor.name, uuid: shape });
            }
        }
        this.shapeNames.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
    _onRender(_context, _options) {
        const changeTypeSelector = this.element.querySelector('select[name="changeType"]');
        changeTypeSelector?.addEventListener("change", event => {
            this.changeType = event.target.value;
            this.render();
        });

        if (game.actorBrowser) {
            const openBrowserButton = this.element.querySelector(".open-actor-browser-button");
            openBrowserButton.addEventListener("click", async () => {
                const worldActorsOnly = !game.modules.get("tcal")?.active; //If TCAL isn't enabled, we only want to browse for world actors
                const result = await game.actorBrowser.openBrowser({ worldActorsOnly: worldActorsOnly });
                if (result) {
                    await this.selectShape(result);
                }
            });
        }

        //Local function for handling actors being dropped on the dialog
        async function onDrop(event) {
            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
            if (data.type == "Actor") {
                this.selectShape(data.uuid);
            }
        }

        //Add the drop binding to the dialog
        const dragDrop = new foundry.applications.ux.DragDrop.implementation({
            dragSelector: null,
            dropSelector: null,
            callbacks: {
                drop: onDrop.bind(this)
            }
        });
        dragDrop.bind(this.element);
    }


    async selectShape(shapeUuid) {
        if (!ShapeChanger.validateUuid(shapeUuid)) return;

        const shapeActor = await fromUuid(shapeUuid);
        if (shapeActor) {
            this.dragDropActor = shapeActor;
            this.render();
        }
    }

    static async handleChangeDialogConfirm(dialog, raise) {
        if (!game.users.activeGM) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoActiveGM"));
            return;
        }

        const shapeValue = dialog.element.querySelector("select[name='shape']")?.value;
        const selectedShape = dialog.shapeNames.find(s => s.name === shapeValue);
        if (selectedShape.uuid == null) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapeSelected"));
            return;
        }

        if (dialog.targets.length > 0) {
            const targetValue = dialog.element.querySelector("select[name='target']")?.value;
            const selectedTarget = dialog.targets.find(t => t.name === targetValue);
            if (!selectedTarget.token) {
                dialog.targetTokens.push(...dialog.targets.filter(t => t.token).map(t => t.token));
            } else {
                dialog.targetTokens.push(selectedTarget.token);
            }
        }

        //Check if we're trying to shape change a token that was already changed
        const updatedTargetTokens = [];
        for (const targetToken of dialog.targetTokens) {
            const originalTokenId = targetToken.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
            if (originalTokenId) {
                const originalToken = canvas.tokens.get(originalTokenId);
                if (originalToken) {
                    //This is an existing shape change. Revert back to the original token and then use that token moving forward
                    await ShapeChangerAPI.revertShape(targetToken);
                    updatedTargetTokens.push(originalToken);
                    continue;
                }
            }

            updatedTargetTokens.push(targetToken);
        }
        dialog.targetTokens = updatedTargetTokens;

        const animalSmarts = dialog.element.querySelector("#animal-smarts");
        const longDuration = dialog.element.querySelector("#duration");

        dialog.close();

        for (const targetToken of dialog.targetTokens) {
            const createdToken = await game.swadeShapeChanger.socket.executeAsGM(
                "changeTokenIntoActor",
                targetToken.scene.id,
                targetToken.id,
                selectedShape.uuid,
                dialog.changeType,
                animalSmarts?.checked ?? false,
                longDuration?.checked ?? false,
                raise);

            ShapeChanger.validateFinalValues(targetToken, createdToken);
        }
    }
}