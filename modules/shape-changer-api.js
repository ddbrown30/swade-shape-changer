import * as SSC_CONFIG from "./ssc-config.js";
import { Utils } from "./utils.js";

/**
 * API functions for interacting with Coins
 */
export class ShapeChangerAPI {

    /* -------------------------------------------- */
    /*                      API                     */
    /* -------------------------------------------- */


    static async changeShape(originalToken) {
        let shapePower = originalToken.actor.items.find((item) => item.type == "power" && (item.system.swid == "shape-change" || item.name == "Shape Change"));
        if (!shapePower) {
            return;
        }

        let shapes = shapePower.getFlag(SSC_CONFIG.NAME, SSC_CONFIG.FLAGS.shapes) ?? [];
        if (shapes.length == 0) {
            return;
        }

        let shapeNames = [];
        for (let shape of shapes) {
            const shapeActor = await fromUuid(shape);
            shapeNames.push({ name: shapeActor.name, label: shapeActor.name, shapeActor: shapeActor });
        }

        shapeNames.sort((a, b) => a.name.localeCompare(b.name));

        let shape = shapeNames[0].key;
        let changeType = "base";

        const templateData = { shapes: shapeNames, shape: shape, changeTypes: SSC_CONFIG.DEFAULT_CONFIG.changeTypes, changeType: changeType };
        const content = await renderTemplate(SSC_CONFIG.DEFAULT_CONFIG.templates.changeShapeDialog, templateData);

        function handleChangeDialogConfirm(html, raise) {
            const shapeChoice = $(html).find("select[name='shape'").find("option:selected");
            let selectedShape = shapeNames.find((s) => s.key == shapeChoice.val());

            const typeChoice = $(html).find("select[name='changeType'").find("option:selected").val();
            const animalSmarts = $(html).find("input[id='animal-smarts'");

            ShapeChangerAPI.createTokenWithActor(originalToken, selectedShape.shapeActor, typeChoice, animalSmarts[0].checked, raise);
        }

        new Dialog({
            title: game.i18n.localize("SSC.ChangeShapeDialog.Title"),
            content: content,
            buttons: {
                success: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.SuccessButtonName"),
                    callback: async (html) => {
                        handleChangeDialogConfirm(html, false);
                    }
                },
                raise: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.RaiseButtonName"),
                    callback: async (html) => {
                        handleChangeDialogConfirm(html, true);
                    }
                },
                cancel: {
                    label: game.i18n.localize("SSC.ChangeShapeDialog.CancelButtonName")
                }
            }
        }).render(true)
    }

    static async createTokenWithActor(originalToken, actorToCreate, typeChoice, animalSmarts, raise) {
        const originalActor = originalToken.actor;
        const newTokenDoc = await actorToCreate.getTokenDocument({ x: originalToken.x, y: originalToken.y });
        let createdToken = await canvas.scene.createEmbeddedDocuments("Token", [newTokenDoc.toObject()]);
        let createdActor = createdToken[0].actor;

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

        await createdActor.createEmbeddedDocuments("Item", itemsToAdd, { render: false, renderSheet: false });

        let hasMaxWoundChange = false;
        for (let effect of originalActor.appliedEffects) {
            for (let change of effect.changes) {
                if (change.key == "system.wounds.max") {
                    hasMaxWoundChange = true;
                    break;
                }
            }
        }

        //The created actor keeps their smarts, spirit, and wounds
        //We also want to make sure that the owners of the original token own the new one too
        let updateData = {
            "ownership": originalActor.ownership,
            "system.attributes.smarts": originalActor.system.attributes.smarts,
            "system.attributes.spirit": originalActor.system.attributes.spirit,
            "system.wounds": originalActor.system.wounds,
            "system.fatigue": originalActor.system.fatigue,
            "system.details.autoCalcToughness": true,
            "system.details.autoCalcParry": true
        };

        if (animalSmarts) {
            updateDatafoundry.utils.mergeObject(updateData, { "system.attributes.smarts.animal": true });
        }

        //On a raise, we boost strength and vigor
        if (typeChoice == "base" && raise) {
            foundry.utils.mergeObject(updateData, {
                "system.attributes.strength.die.sides": (createdActor.system.attributes.strength.die.sides + 2),
                "system.attributes.vigor.die.sides": (createdActor.system.attributes.vigor.die.sides + 2)
            });
        }

        //Copy over any temporary effects
        //We're not copying permanent effects as there is a high chance that we don't want them. If someone wants them, they can drag them over manually
        let effectsToAdd = originalActor.effects.filter(effect => effect.isTemporary);
        await createdActor.createEmbeddedDocuments("ActiveEffect", effectsToAdd);

        await createdActor.update(updateData);

        //Hide the original token and move it to the side
        await canvas.scene.updateEmbeddedDocuments("Token", [{
            _id: originalToken.id,
            x: originalToken.x - canvas.grid.size,
            y: originalToken.y - canvas.grid.size,
            "hidden": true
        }]);

        if (hasMaxWoundChange) {
            new Dialog({
                title: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Title"),
                content: game.i18n.localize("SSC.ChangeShapeDialog.MaxWoundNotification.Body"),
                buttons: { ok: { label: game.i18n.localize("SSC.Okay") } }
            }).render(true);
        }
    }
}