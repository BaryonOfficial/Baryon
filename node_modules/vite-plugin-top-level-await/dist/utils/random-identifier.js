"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RandomIdentifierGenerator = void 0;
const uuid_1 = require("uuid");
class RandomIdentifierGenerator {
    constructor(seed) {
        const INITIAL_NAMESPACE = "7976c25e-8279-4241-9a9a-e1831e9feab1";
        this.state = (0, uuid_1.v5)(seed, INITIAL_NAMESPACE);
    }
    generate() {
        this.state = (0, uuid_1.v5)(this.state, this.state);
        return "var_" + this.state.split("-").join("_");
    }
}
exports.RandomIdentifierGenerator = RandomIdentifierGenerator;
