class Override {
    constructor(id, dimensions, limit, ttl) {
        this.id = id;
        this.dimensions = dimensions;
        this.limit = limit;
        this.ttl = ttl;
        this.createdAt = Date.now();
    }
}

module.exports = Override;
