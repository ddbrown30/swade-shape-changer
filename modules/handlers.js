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
    }

    /**
     * Pre Update Item handler
     * @param {*} app
     * @param {*} html
     * @param {*} data
     */
    static async onPreUpdateItem(app, html, data) {
        if (!Utils.isShapeChangePower(app)) {
            return;
        }

        //If we're making a change to the shape change power, we need to save the current tab so that it doesn't accidentally switch during the render
        Handlers.openTab = true;
        Handlers.activeTab = app._sheet._tabs?.[0]?.active;
    }

    /**
     * Render Item Sheet handler
     * @param {*} app
     * @param {*} html
     * @param {*} data
     */
    static async onRenderItemSheet(app, html, data) {
        let item = app.object;
        if (!Utils.isShapeChangePower(item)) {
            return;
        }

        //Local function for handling actors being dropped on the shape change item sheet
        async function onDrop(event) {
            const data = TextEditor.getDragEventData(event);
            if (data.type == "Actor") {
                Handlers.addActorToShapeChangePower(data, this);
            }
        }

        //Add the drop binding to the item sheet
        const dragDrop = new DragDrop({
            dragSelector: null,
            dropSelector: null,
            callbacks: {
                drop: onDrop.bind(item)
            }
        });
        dragDrop.bind(app.form);

        Handlers.addTabToShapeChangeSheet(html, item);
    }

    /**
     * Adds a new tab to the shape change power sheet that displays our list of shapes
     * @param {*} html
     * @param {Item} power //The shape change power item
     */
    static async addTabToShapeChangeSheet(html, power) {
        let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? [];
        let shapeData = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeData.push({ name: shapeActor.name, img: shapeActor.img, uuid: shape });
        }

        shapeData.sort((a, b) => a.name.localeCompare(b.name));

        const templateData = { shapes: shapeData, isOwner: power.isOwner };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.shapesTab, templateData);

        $('.tabs', html).append($('<a>').addClass("item").attr("data-tab", "shapes").html(game.i18n.localize('SSC.ShapesTab.Tab')));
        $('<section>').addClass("tab shapes").attr('data-tab', 'shapes').html(content).insertAfter($('.tab:last', html));

        //Event handler for the actor
        html.find("input.actor-button").click(ev => {
            let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
            let shape = shapes.find(e => e == ev.currentTarget.dataset.shapeId);
            const shapeActor = fromUuidSync(shape);
            //shapeActor.ownership[game.user.id] = shapeActor.ownership[game.user.id] ?? 2;
            shapeActor.sheet._canUserView = function() { return true; };
            shapeActor.sheet.render(true);
        });

        //Event handler for the delete buttons
        html.find("[class='shape-delete']").click(ev => {
            let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
            shapes = shapes.filter(e => e !== ev.currentTarget.dataset.shapeId);
            power.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes, shapes);
        });

        //This hack ensures the correct tab stays open when the sheet renders
        if (Handlers.openTab) {
            power.sheet._tabs?.[0]?.activate?.(Handlers.activeTab);
            Handlers.openTab = false;
        }
    }

    /**
     * Adds an actor to the list of shapes on the shape change power
     * @param {*} data
     * @param {Item} power //The shape change power item
     */
    static addActorToShapeChangePower(data, power) {
        if (data.uuid.startsWith("Compendium")) {
            //We don't support using actors directly from the compendium
            //Show a warning popup and return
            new Dialog({
                title: game.i18n.localize("SSC.CompendiumWarning.Title"),
                content: game.i18n.localize("SSC.CompendiumWarning.Body"),
                buttons: { ok: { label: game.i18n.localize("SSC.Okay") } }
            }).render(true);
            return;
        }

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
            const power = actor.items.find((item) => item.type == "power" && item.system.swid == "shape-change");
            if (power) {
                Dialog.confirm({
                    title: game.i18n.localize("SSC.ActorSheetDropDialog.Title"),
                    content: game.i18n.localize("SSC.ActorSheetDropDialog.Body"),
                    yes: () => { Handlers.addActorToShapeChangePower(data, power); },
                    no: () => { },
                    defaultYes: true
                });
            }
        }
    }
}
