import { extractAvailableCount } from "./handshake";

const samplePayload = [
  {
    result: {
      data: {
        json: {
          tasks: [{ id: "1" }, { id: "2" }]
        }
      }
    }
  }
];

console.log("Mock available count:", extractAvailableCount(samplePayload));
