import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class ShapeChanger {

    static openTab = false;
    static activeTab;

    /* -------------------------------------------- */
    /*                   Handlers                   */
    /* -------------------------------------------- */

    static async onReady() {
    }

    static async onPreUpdateItem(app, html, data) {
        if (!Utils.isShapeChangePower(app)) {
            return;
        }

        //If we're making a change to the shape change power, we need to save the current tab so that it doesn't accidentally switch during the render
        ShapeChanger.openTab = true;
        ShapeChanger.activeTab = app._sheet._tabs?.[0]?.active;
    }

    static async onRenderItemSheet(app, html, data) {
        let item = app.object;
        if (!Utils.isShapeChangePower(item)) {
            return;
        }

        //Local function for handling actors being dropped on the shape change item sheet
        async function onDrop(event) {
            const data = TextEditor.getDragEventData(event);
            if (data.type == "Actor") {
                ShapeChanger.addActorToShapeChangePower(data, this);
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

        ShapeChanger.addTabToShapeChangeSheet(html, item);
    }

    static async addTabToShapeChangeSheet(html, item) {
        let shapes = item.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? [];
        let shapeData = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeData.push({ name: shapeActor.name, uuid: shape });
        }
        
        shapeData.sort((a, b) => a.name.localeCompare(b.name));

        const templateData = { shapes: shapeData, isOwner: item.isOwner };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.shapesTab, templateData);

        $('.tabs', html).append($('<a>').addClass("item").attr("data-tab", "shapes").html(game.i18n.localize('SSC.ShapesTab.Tab')));
        $('<section>').addClass("tab shapes").attr('data-tab', 'shapes').html(content).insertAfter($('.tab:last', html));

        //Event handler for the delete buttons
        html.find("[class='item-delete']").click(ev => {
            let shapes = item.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
            shapes = shapes.filter(e => e !== ev.currentTarget.dataset.itemId);
            item.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes, shapes);
        });

        //This hack ensures the correct tab stays open when the sheet renders
        if (ShapeChanger.openTab) {
            item.sheet._tabs?.[0]?.activate?.(ShapeChanger.activeTab);
            ShapeChanger.openTab = false;
        }
    }

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

    static async onDropActorSheetData(actor, sheet, data) {
        if (data.type == "Actor") {
            const power = actor.items.find((item) => item.type == "power" && item.system.swid == "shape-change");
            if (power) {
                Dialog.confirm({
                    title: game.i18n.localize("SSC.ActorSheetDropDialog.Title"),
                    content: game.i18n.localize("SSC.ActorSheetDropDialog.Body"),
                    yes: () => { ShapeChanger.addActorToShapeChangePower(data, power);},
                    no: () => {},
                    defaultYes: true
                });
            }
        }
    }
}
