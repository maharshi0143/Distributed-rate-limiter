const express = require('express');
const testRoutes = require("./routes/testRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const overrideRoutes = require("./routes/overrideRoutes");
const app = express();

app.use(express.json());
app.use("/api", testRoutes);
app.use("/rules", ruleRoutes);
app.use("/overrides", overrideRoutes);

app.get('/', (req, res) => {
    res.status(200).json({ 
        success: true,
        message: "Distributed Rate Limiter Service Running 🚀"  
    });
});

module.exports = app;