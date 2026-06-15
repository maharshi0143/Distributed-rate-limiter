const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const Override = require("../models/overrideModel");
const overrideService = require("../services/overrideService");

router.post("/", async (req, res) => {
    try {
        const { dimensions, limit, ttl } = req.body;

        if (!dimensions || !limit || !ttl) {
            return res.status(400).json({ message: "dimensions, limit, and ttl are required" });
        }

        const override = new Override(uuidv4(), dimensions, limit, ttl);
        await overrideService.createOverride(override);

        res.status(201).json(override);
    } catch (error) {
        console.error("Error creating override:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const override = await overrideService.getOverride(req.params.id);
        if (!override) {
            return res.status(404).json({ message: "Override not found" });
        }
        res.status(200).json(override);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        await overrideService.deleteOverride(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
