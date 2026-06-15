const express = require("express");

const router = express.Router();

const { v4: uuidv4 } = require("uuid");

const Rule = require("../models/ruleModel");

const ruleService = require("../services/ruleServices");

router.post("/", async(req, res)=>{
    try{
        const{
            dimensions,
            algorithm,
            limit,
            duration,
            burst
        } = req.body;

        if (!Array.isArray(dimensions) || !algorithm || limit == null || duration == null) {
            return res.status(400).json({
                message: "dimensions, algorithm, limit, and duration are required"
            });
        }

        const rule = new Rule(
            uuidv4(),
            dimensions,
            algorithm,
            limit,
            duration,
            burst
        );

        await ruleService.createRule(rule);

        res.status(201).json(rule);

    }catch (error) {
        console.error("Error in creating rule:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


router.get("/:id", async (req, res) => {
    try {
        const rule = await ruleService.getRule(
            req.params.id
        );

        if (!rule) {

            return res.status(404).json({
                message: "Rule not found"
            });
        }
        res.status(200).json(rule);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});


router.put("/:id", async (req, res) => {

    try {
        const updatedRule = {
            id: req.params.id,
            ...req.body
        };

        await ruleService.updateRule(
            req.params.id,
            updatedRule
        );

        res.status(200).json(updatedRule);
    } catch (error) {

        res.status(500).json({
            message: error.message
        });
    }
});



router.delete("/:id", async (req, res) => {
    try {
        await ruleService.deleteRule(
            req.params.id
        );
        res.status(204).send();

    } catch (error) {

        res.status(500).json({
            message: error.message
        });
    }
});


module.exports = router;