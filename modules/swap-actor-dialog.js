import { ShapeChangerAPI } from "./shape-changer-api.js";
import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api

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
            confirm: function (event, button) { SwapActorDialog.handleSwapDialogConfirm(this); },
            cancel: function (event, button) { this.close(); }
        },
    };

    static PARTS = {
        form: {
            template: SSC_CONFIG.DEFAULT_CONFIG.templates.swapActorDialog,
        }
    };

    async _prepareContext(_options) {
        let sourceToken = this.document.object;

        const placeholderText = game.actorBrowser ?
                                    game.i18n.localize("SSC.SwapActorDialog.DragActorWithActorBrowser") :
                                    game.i18n.localize("SSC.SwapActorDialog.DragActor");
        let selectedActorText = this.selectedActor?.name;

        this.targets = [];
        this.targetTokens = [];
        if (game.user.targets.size > 0) {
            for (const target of game.user.targets) {
                this.targets.push({ name: target.name, label: target.name, token: target });
            }
            this.targets.sort((a, b) => a.name.localeCompare(b.name));

            if (game.user.targets.size > 1) {
                const allTargetsString = game.i18n.localize("SSC.SwapActorDialog.TargetSelectionAll");
                this.targets.unshift({ name: allTargetsString, label: allTargetsString, token: null });
            }
        } else {
            this.targetTokens.push(game.user.targets.size == 1 ? game.user.targets.first() : sourceToken);
        }

        return {
            placeholderText: placeholderText,
            selectedActorText: selectedActorText,
            hasSelectedActor: !!this.selectedActor,
            targets: this.targets,
            target: this.targets[0]?.name,
            actorBrowser: !!game.actorBrowser
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
        if (game.actorBrowser) {
            const openBrowserButton = this.element.querySelector(".open-actor-browser-button");
            openBrowserButton.addEventListener("click", async event => {
                let worldActorsOnly = !game.modules.get("tcal")?.active; //If TCAL isn't enabled, we only want to browse for world actors
                let result = await game.actorBrowser.openBrowser({ worldActorsOnly: worldActorsOnly });
                if (result) {
                    await this.selectActor(result);
                }
            });
        }

        //Local function for handling actors being dropped on the dialog
        async function onDrop(event) {
            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
            if (data.type == "Actor") {
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

        if (dialog.targets.length > 0) {
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

        //Check if we're trying to swap a token that was already swapped
        for (let targetToken of dialog.targetTokens) {
            let originalTokenId = targetToken.document.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken);
            if (originalTokenId) {
                let originalToken = canvas.tokens.get(originalTokenId);
                if (originalToken) {
                    //This is an existing shape change. Revert back to the original token and then use that token moving forward
                    await ShapeChangerAPI.revertShape(targetToken);
                    dialog.targetTokens = dialog.targetTokens.filter(t => t.id != targetToken.id);
                    dialog.targetTokens.push(originalToken);
                }
            }
        }

        dialog.close();

        for (let targetToken of dialog.targetTokens) {
            await game.swadeShapeChanger.socket.executeAsGM(
                "swapTokenToActor",
                targetToken.scene.id,
                targetToken.id,
                dialog.selectedActor.uuid);
        }
    }
}