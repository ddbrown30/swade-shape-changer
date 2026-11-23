import { ShapeChangerAPI } from "./shape-changer-api.js";
import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for configuring and executing an actor swap
 */
export class SwapActorDialog extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
        id: "swap-actor-dialog",
        tag: "form",
        classes: ["swap-actor-dialog"],
        window: { title: "SSC.SwapActorDialog.Title" },
        position: { width: "250" },
        actions: {
            confirm: function () { SwapActorDialog.handleSwapDialogConfirm(this); },
            cancel: function () { this.close(); }
        },
    };

    static PARTS = {
        form: {
            template: SSC_CONFIG.DEFAULT_CONFIG.templates.swapActorDialog,
        }
    };

    async _prepareContext(_options) {
        const sourceToken = this.document.object;

        const placeholderText = game.actorBrowser ?
            game.i18n.localize("SSC.SwapActorDialog.DragActorWithActorBrowser") :
            game.i18n.localize("SSC.SwapActorDialog.DragActor");

        this.targetTokens = [];
        this.targets = [...game.user.targets]
            .map(target => ({ name: target.name, label: target.name, token: target }))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (this.targets.length > 1) {
            const allTargetsString = game.i18n.localize("SSC.SwapActorDialog.TargetSelectionAll");
            this.targets.unshift({
                name: allTargetsString,
                label: allTargetsString,
                token: null
            });
        } else {
            this.targetTokens.push(game.user.targets.size === 1 ? game.user.targets.first() : sourceToken);
        }

        return {
            placeholderText: placeholderText,
            selectedActorText: this.selectedActor?.name,
            hasSelectedActor: !!this.selectedActor,
            targets: this.targets,
            target: this.targets[0]?.name,
            actorBrowser: !!game.actorBrowser
        };
    }

    /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
    _onRender(_context, _options) {
        if (game.actorBrowser) {
            const openBrowserButton = this.element.querySelector(".open-actor-browser-button");
            openBrowserButton.addEventListener("click", async () => {
                const worldActorsOnly = !game.modules.get("tcal")?.active; //If TCAL isn't enabled, we only want to browse for world actors
                const result = await game.actorBrowser.openBrowser({ worldActorsOnly: worldActorsOnly });
                if (result) {
                    await this.selectActor(result);
                }
            });
        }

        //Local function for handling actors being dropped on the dialog
        async function onDrop(event) {
            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
            if (data.type === "Actor") {
                this.selectActor(data.uuid);
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


    async selectActor(actorUuid) {
        if (!ShapeChanger.validateUuid(actorUuid)) return;

        const actor = await fromUuid(actorUuid);
        if (actor) {
            this.selectedActor = actor;
            this.render();
        }
    }

    static async handleSwapDialogConfirm(dialog) {
        if (!game.users.activeGM) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoActiveGM"));
            return;
        }

        if (!dialog.selectedActor?.uuid) {
            Utils.showNotification("error", game.i18n.localize("SSC.Errors.NoShapeSelected"));
            return;
        }

        if (dialog.targets.length > 1) {
            const targetValue = dialog.element.querySelector("select[name='target']")?.value;
            const selectedTarget = dialog.targets.find(t => t.name === targetValue);
            if (!selectedTarget.token) {
                dialog.targetTokens.push(...dialog.targets.filter(t => t.token).map(t => t.token));
            } else {
                dialog.targetTokens.push(selectedTarget.token);
            }
        }

        //Check if we're trying to swap a token that was already swapped
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

        dialog.close();

        for (const targetToken of dialog.targetTokens) {
            await game.swadeShapeChanger.socket.executeAsGM(
                "swapTokenToActor",
                targetToken.scene.id,
                targetToken.id,
                dialog.selectedActor.uuid);
        }
    }
}