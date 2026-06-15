class Rule {
    constructor(
        id,
        dimensions,
        algorithm,
        limit,
        duration,
        burst = null
    ){
        this.id = id;
        this.dimensions = dimensions;
        this.algorithm = algorithm;
        this.limit = limit;
        this.duration = duration;
        this.burst = burst;
    }
}

module.exports = Rule;