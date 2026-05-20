import { ShapeChanger } from "./shape-changer.js";
import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class Handlers {

    static openTab = false;
    static activeTab;

    /* -------------------------------------------- */
    /*                   Handlers                   */
    /* -------------------------------------------- */

    /**
     */
    static async onReady() {
        if (!game.user.isGM) return;

        if (!game.modules.get("tcal")?.active) {
            if (!Utils.getSetting(SSC_CONFIG.SETTING_KEYS.ignoreTcalWarning)) {
                foundry.applications.api.DialogV2.wait({
                    window: { title: game.i18n.localize("SSC.TcalWarning.Title") },
                    content: game.i18n.localize("SSC.TcalWarning.Body"),
                    position: { width: 400 },
                    buttons: [
                        {
                            label: "SSC.Okay",
                            action: "okay",
                        },
                        {
                            label: "SSC.TcalWarning.IgnoreButton",
                            action: "ignore",
                            callback: (event, button, dialog) => Utils.setSetting(SSC_CONFIG.SETTING_KEYS.ignoreTcalWarning, true)
                        },
                    ],
                });
            }
        }
    }

    /**
     * Pre Update Item handler
     * @param {*} app
     * @param {*} html
     * @param {*} data
     */
    static async onPreUpdateItem(item, changes, options, user) {
        if (Utils.isShapeChangePower(item)) {
            //If we're making a change to the shape change power, we need to save the current tab so that it doesn't accidentally switch during the render
            Handlers.openTab = true;
            Handlers.activeTab = item.sheet.tabGroups["main"];
        } else if (Utils.isTransformationAbility(item)) {
            //If we're making a change to the transformation ability, we need to save the current tab so that it doesn't accidentally switch during the render
            Handlers.openTab = true;
            Handlers.activeTab = item.sheet.tabGroups["main"];
        }
    }

    /**
     * Render Item Sheet handler
     * @param {*} app
     * @param {*} html
     * @param {*} data
     */
    static async onRenderItemSheet(app, html, data) {
        let item = app.item;
        if (Utils.isShapeChangePower(item)) {

            //Local function for handling actors being dropped on the shape change item sheet
            async function onDrop(event) {
                const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
                if (data.type == "Actor") {
                    Handlers.addActorToShapeChangePower(data, this);
                }
            }

            //Add the drop binding to the item sheet
            const dragDrop = new foundry.applications.ux.DragDrop.implementation({
                dragSelector: null,
                dropSelector: null,
                callbacks: {
                    drop: onDrop.bind(item)
                }
            });
            dragDrop.bind(app.form);

            Handlers.addTabToShapeChangeSheet(app, html, item);
        } else if (Utils.isTransformationAbility(item)) {
            Handlers.addTabToTransformationAbility(app, html, item);
        }
    }

    /**
     * Adds a new tab to the shape change power sheet that displays our list of shapes
     * @param {*} html
     * @param {Item} power //The shape change power item
     */
    static async addTabToShapeChangeSheet(app, html, power) {
        let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? [];
        let shapeData = [];

        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeData.push({
                name: shapeActor ? shapeActor.name : game.i18n.localize('SSC.ShapesTab.InvalidActor'),
                img: shapeActor?.img,
                uuid: shape
            });
        }

        shapeData.sort((a, b) => a.name.localeCompare(b.name));

        const templateData = { shapes: shapeData, isOwner: power.isOwner };
        const content = await foundry.applications.handlebars.renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.shapesTab, templateData);

        //Add tab button
        const tabs = html.querySelector('.tabs');
        const tabButton = document.createElement('a');
        tabButton.classList.add("item");
        tabButton.dataset.action = "tab";
        tabButton.dataset.tab = "shapes";
        tabButton.dataset.group = "main";
        tabButton.innerHTML = game.i18n.localize('SSC.ShapesTab.Tab');
        tabs.appendChild(tabButton);

        //Add tab section
        const section = document.createElement('section');
        section.classList.add("tab", "shapes", "scrollable");
        section.dataset.tab = "shapes";
        section.dataset.group = "main";
        section.innerHTML = content;

        const lastTab = html.querySelector('.tab:last-of-type');
        lastTab?.after(section);

        //Event handler for actor buttons
        html.querySelectorAll("input.actor-button").forEach(el => {
            el.addEventListener("click", ev => {
                let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
                let shape = shapes.find(e => e == ev.currentTarget.dataset.shapeId);

                const shapeActor = fromUuidSync(shape);
                if (shapeActor) {
                    shapeActor.sheet._canUserView = function () { return true; };
                    shapeActor.sheet.render(true);
                }
            });
        });

        //Event handler for delete buttons
        html.querySelectorAll(".shape-delete").forEach(el => {
            el.addEventListener("click", ev => {
                let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
                shapes = shapes.filter(e => e !== ev.currentTarget.dataset.shapeId);
                power.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes, shapes);
            });
        });

        //This hack ensures the correct tab stays open when the sheet renders
            app.changeTab(app.tabGroups["main"], "main", { force: true });
    }

    /**
     * Adds an actor to the list of shapes on the shape change power
     * @param {*} data
     * @param {Item} power //The shape change power item
     */
    static addActorToShapeChangePower(data, power) {
        if (!ShapeChanger.validateUuid(data.uuid)) return;

        let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
        shapes = shapes ? shapes : [];
        if (shapes.includes(data.uuid)) {
            //This actor is already in our list
            return;
        }

        if (power.actor && data.uuid == power.actor.uuid) {
            //No reason to add ourself
            return;
        }

        //Add the new actor to the powers flags
        shapes.push(data.uuid);
        power.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes, shapes);
    }

    /**
     * DropActorSheetData handler
     * Asks the player if they'd like to forward the drop to the shape change power
     * @param {*} actor
     * @param {*} sheet
     * @param {*} data
     */
    static async onDropActorSheetData(actor, sheet, data) {
        if (data.type == "Actor") {
            const power = actor.items.find((item) => Utils.isShapeChangePower(item));
            if (power) {
                foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize("SSC.ActorSheetDropDialog.Title") },
                    content: game.i18n.localize("SSC.ActorSheetDropDialog.Body"),
                    position: { width: 400 },
                    yes: { callback: (event, button, dialog) => Handlers.addActorToShapeChangePower(data, power) },
                    defaultYes: true
                });
            }
        }
    }

    /**
     * Adds a new tab to the transformation ability sheet that displays info about our human shape
     * @param {*} html
     * @param {Item} ability //The transformation ability item
     */
    static async addTabToTransformationAbility(app, html, ability) {
        let humanTokenImg = ability.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenImg) ?? "";
        let humanTokenScale = ability.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenScale) ?? "";

        const templateData = { humanTokenImg: humanTokenImg, humanTokenScale: humanTokenScale, isOwner: ability.isOwner };
        const content = await foundry.applications.handlebars.renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.humanTab, templateData);

        //Add tab button
        const tabs = html.querySelector(".tabs");
        const tabButton = document.createElement("a");
        tabButton.classList.add("item");
        tabButton.dataset.action = "tab";
        tabButton.dataset.tab = "human";
        tabButton.dataset.group = "main";
        tabButton.innerHTML = game.i18n.localize("SSC.HumanTab.Tab");
        tabs.appendChild(tabButton);

        //Add tab section
        const section = document.createElement("section");
        section.classList.add("tab", "human", "scrollable");
        section.dataset.tab = "human";
        section.dataset.group = "main";
        section.innerHTML = content;

        const lastTab = html.querySelector(".tab:last-of-type");
        lastTab?.after(section);

        //File picker button
        html.querySelectorAll("button.file-picker").forEach(el => {
            el.addEventListener("click", Handlers.activateFilePicker.bind(app));
        });

        //Image path change
        html.querySelectorAll("input[name='human-img-path']").forEach(el => {
            el.addEventListener("change", async event => {
                await ability.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenImg, event.target.value);
            });
        });

        //Scale change
        html.querySelectorAll("range-picker[name='scale']").forEach(el => {
            el.addEventListener("change", async event => {
                await ability.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.humanTokenScale, event.target.value);
            });
        });

        //This hack ensures the correct tab stays open when the sheet renders
            app.changeTab(app.tabGroups["main"], "main", { force: true });
    }

    static activateFilePicker(event) {
        event.preventDefault();

        const button = event.currentTarget;
        const target = button.dataset.target;
        const field = button.form[target] || null;

        const options = {
            field: field,
            type: button.dataset.type,
            current: field?.value ?? "",
            button: button
        };

        const fp = new FilePicker(options);
        return fp.browse();
    }
}
