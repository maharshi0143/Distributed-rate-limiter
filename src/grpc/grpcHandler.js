const ruleService = require("../services/ruleServices");
const rateLimiterService = require("../services/rateLimiterService");
const overrideService = require("../services/overrideService");
const { dimensionsMatch } = require("../utils/dimensions");

function compareRestrictiveness(left, right) {
    const leftLimit = Number(left.limit ?? Number.POSITIVE_INFINITY);
    const rightLimit = Number(right.limit ?? Number.POSITIVE_INFINITY);

    if (leftLimit !== rightLimit) {
        return leftLimit - rightLimit;
    }

    const leftDuration = Number(left.duration ?? Number.POSITIVE_INFINITY);
    const rightDuration = Number(right.duration ?? Number.POSITIVE_INFINITY);

    if (leftDuration !== rightDuration) {
        return leftDuration - rightDuration;
    }

    return String(left.id).localeCompare(String(right.id));
}

async function evaluate(call, callback) {
    try {
        const dimensions = call.request.dimensions || [];
        const dryRun = call.request.dry_run;

        if (dimensions.length === 0) {
            return callback(null, { decision: 2, matched_rule_id: "" });
        }

        const rules = await ruleService.getAllRules();

        const matchingRules = rules
            .filter((rule) => dimensionsMatch(rule.dimensions, dimensions))
            .sort(compareRestrictiveness);

        if (matchingRules.length === 0) {
            return callback(null, { decision: 1, matched_rule_id: "" });
        }

        const matchingOverrides = await overrideService.findMatchingOverrides(dimensions);
        const selectedOverride = matchingOverrides.sort(compareRestrictiveness)[0] || null;

        const selectedRule = matchingRules[0];
        const effectiveRule = selectedOverride
            ? { ...selectedRule, limit: selectedOverride.limit }
            : selectedRule;

        const result = await rateLimiterService.evaluate(effectiveRule, dimensions, dryRun);

        if (!result.allowed) {
            return callback(null, { decision: 2, matched_rule_id: selectedRule.id });
        }

        callback(null, { decision: 1, matched_rule_id: selectedRule.id });
    } catch (error) {
        console.error("gRPC evaluate error:", error);
        callback(error);
    }
}

module.exports = { evaluate };
