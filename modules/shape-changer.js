import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

export class ShapeChanger {

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
        ShapeChanger.openTab = true;
        ShapeChanger.activeTab = app._sheet._tabs?.[0]?.active;
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
            shapeData.push({ name: shapeActor.name, uuid: shape });
        }

        shapeData.sort((a, b) => a.name.localeCompare(b.name));

        const templateData = { shapes: shapeData, isOwner: power.isOwner };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.shapesTab, templateData);

        $('.tabs', html).append($('<a>').addClass("item").attr("data-tab", "shapes").html(game.i18n.localize('SSC.ShapesTab.Tab')));
        $('<section>').addClass("tab shapes").attr('data-tab', 'shapes').html(content).insertAfter($('.tab:last', html));

        //Event handler for the delete buttons
        html.find("[class='item-delete']").click(ev => {
            let shapes = power.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes);
            shapes = shapes.filter(e => e !== ev.currentTarget.dataset.itemId);
            power.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes, shapes);
        });

        //This hack ensures the correct tab stays open when the sheet renders
        if (ShapeChanger.openTab) {
            power.sheet._tabs?.[0]?.activate?.(ShapeChanger.activeTab);
            ShapeChanger.openTab = false;
        }
    }

    /**
     * Adds an actor to the list of shapes on the shape change power
     * @param {*} html
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
     * @param {*} app
     * @param {*} html
     * @param {*} data
     */
    static async onDropActorSheetData(actor, sheet, data) {
        if (data.type == "Actor") {
            const power = actor.items.find((item) => item.type == "power" && item.system.swid == "shape-change");
            if (power) {
                Dialog.confirm({
                    title: game.i18n.localize("SSC.ActorSheetDropDialog.Title"),
                    content: game.i18n.localize("SSC.ActorSheetDropDialog.Body"),
                    yes: () => { ShapeChanger.addActorToShapeChangePower(data, power); },
                    no: () => { },
                    defaultYes: true
                });
            }
        }
    }

    /**
     * Creates a new token based on an actor and configures it following the rules for the shape change power
     * @param {Token} originalToken //The token being transformed
     * @param {Actor} actorToCreate //The actor to copy
     * @param {String} typeChoice //The type of shape change (base or polymorph)
     * @param {Boolean} animalSmarts //If true, the smarts on the new actor wil be marked as animal
     * @param {Boolean} raise //If true, make modifications as if the power was cast with a raise
     */
    static async createTokenWithActor(originalToken, actorToCreate, typeChoice, animalSmarts, raise) {
        const originalActor = originalToken.actor;
        const newTokenDoc = await actorToCreate.getTokenDocument({
            x: originalToken.x,
            y: originalToken.y,
            disposition: originalToken.document.disposition,
            name: originalToken.document.name,
            displayName: originalToken.document.displayName,
            actorLink: false, //We always want to unlink the actor so that we don't modify the original
        });

        //We want to make sure that the owners of the original token own the new one too
        newTokenDoc.baseActor.ownership = originalToken.actor.ownership;

        //Mark the token as a shape change source so that we warn the user if they try to delete it
        await originalToken.document.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.isChangeSource, true);

        let createdToken = (await canvas.scene.createEmbeddedDocuments("Token", [newTokenDoc.toObject()]))[0];
        let createdActor = createdToken.actor;

        //Hide the original token and move it to the side
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalToken.id,
            x: originalToken.x - canvas.grid.size,
            y: originalToken.y - canvas.grid.size,
            "hidden": true
        }]);


        //The shape change power retains the edges, hindrances, powers, and smarts and spirit linked skills of the original form
        //We need to delete all of those from the created actor and then copy over the ones from the original actor
        //We skip anything marked as grantedBy as those will be removed or granted again automatically if needed

        //Edges, hindrances, and powers are not kept
        let itemsToRemove = createdActor.items.filter(item => {
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        });

        //Smarts and spirit linked skills are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "skill" && (item.system.attribute == "spirit" || item.system.attribute == "smarts")
        ));

        //Resilient and Very Resilient are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "ability" && (item.system.swid.includes("resilient") || item.name.toLowerCase().includes("resilient"))
        ));

        //Innate powers are not kept
        itemsToRemove = itemsToRemove.concat(createdActor.items.filter(item =>
            item.type == "ability" && (item.system.swid.includes("innate-power") || item.name.toLowerCase().includes("innate power"))
        ));

        for (let item of itemsToRemove) {
            await item.delete();
        }

        //Now copy over the required items from the original actor

        //Edges, hindrances, and powers are carried over
        let itemsToAdd = originalActor.items.filter(item =>
            (item.type == "edge" || item.type == "hindrance" || item.type == "power") && !item.grantedBy
        );

        //Smarts and spirit linked skills are carried over
        itemsToAdd = itemsToAdd.concat(originalActor.items.filter(item =>
            item.type == "skill" && (item.system.attribute == "spirit" || item.system.attribute == "smarts")
        ));

        createdActor.createEmbeddedDocuments("Item", itemsToAdd, { render: false, renderSheet: false });

        //Copy over any temporary effects
        //We're not copying permanent effects as there is a high chance that we don't want them. If someone wants them, they can drag them over manually
        let effectsToAdd = originalActor.effects.filter(effect => effect.isTemporary);
        createdActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd);

        //The created actor keeps their smarts, spirit, and wounds
        let actorUpdateData = {
            "system.attributes.smarts": originalActor.system.attributes.smarts,
            "system.attributes.spirit": originalActor.system.attributes.spirit,
            "system.bennies.value": originalActor.system.bennies.value,
            "system.wounds": originalActor.system.wounds,
            "system.fatigue": originalActor.system.fatigue,
            "system.details.autoCalcToughness": true,
            "system.details.autoCalcParry": true
        };

        if (animalSmarts) {
            updateDatafoundry.utils.mergeObject(actorUpdateData, { "system.attributes.smarts.animal": true });
        }

        //On a raise, we boost strength and vigor
        if (typeChoice == "base" && raise) {
            foundry.utils.mergeObject(actorUpdateData, {
                "system.attributes.strength.die.sides": (createdActor.system.attributes.strength.die.sides + 2),
                "system.attributes.vigor.die.sides": (createdActor.system.attributes.vigor.die.sides + 2)
            });
        }

        await createdActor.update(actorUpdateData);

        //Record our original token so we can use it to revert later
        await createdToken.setFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.originalToken, originalToken.id);

        //The new token takes the place of the old in the combat tracker
        if (originalToken.combatant) {
            await originalToken.combatant.combat.createEmbeddedDocuments("Combatant", [{
                tokenId: createdToken.id,
                sceneId: createdToken.parent.id,
                actorId: createdToken.actorId,
                initiative: originalToken.combatant.initiative,
                flags: originalToken.combatant.flags
            }]);

            await originalToken.combatant.combat.deleteEmbeddedDocuments("Combatant", [originalToken.combatant.id]);
        }

        if (!Utils.getSetting(SSC_CONFIG.SETTING_KEYS.ignoreWoundWarning)) {
            //Check if we have any effects that are modifying the max wounds and warn the user if so
            let hasMaxWoundChange = false;
            for (let effect of originalActor.appliedEffects) {
                for (let change of effect.changes) {
                    if (change.key == "system.wounds.max") {
                        hasMaxWoundChange = true;
                        break;
                    }
                }
            }

            if (hasMaxWoundChange) {
                new Dialog({
                    title: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Title"),
                    content: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Body"),
                    buttons: {
                        ok: { label: game.i18n.localize("SSC.Okay") },
                        ignore: {
                            label: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.IgnoreButton"),
                            callback: async (html) => {
                                Utils.setSetting(SSC_CONFIG.SETTING_KEYS.ignoreWoundWarning, true);
                            }
                        }
                    },
                    default: "ok"
                }).render(true);
            }
        }
    }
}
