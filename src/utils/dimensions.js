function normalizeDimensions(dimensions = []) {
    return [...dimensions]
        .map((dimension) => ({
            key: String(dimension.key),
            value: String(dimension.value)
        }))
        .sort((left, right) => {
            if (left.key === right.key) {
                return left.value.localeCompare(right.value);
            }
            return left.key.localeCompare(right.key);
        });
}

function dimensionSignature(dimensions = []) {
    return normalizeDimensions(dimensions)
        .map((dimension) => `${dimension.key}=${dimension.value}`)
        .join("|");
}

function dimensionsMatch(requiredDimensions = [], requestDimensions = []) {
    const requestIndex = new Map(
        requestDimensions.map((dimension) => [dimension.key, dimension.value])
    );

    return requiredDimensions.every((dimension) =>
        requestIndex.get(dimension.key) === dimension.value
    );
}

module.exports = {
    normalizeDimensions,
    dimensionSignature,
    dimensionsMatch
};