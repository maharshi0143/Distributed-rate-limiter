// Test routes for redis

const express = require("express");

const router = express.Router();

const redisClient = require("../redis/redisClient");

router.get("/redis-test", async (req, res) => {
    try{
        await redisClient.set("name", "Maharshi");

        const value = await redisClient.get("name");

        res.status(200).json({
            success: true,
            message: "Redis is working properly 🚀",
            value
        });
    } catch (error) {
        console.error("Error in redis-test route:", error);
        res.status(500).json({
            success: false,
            message: "error.message"
        });
    }
});

module.exports = router;