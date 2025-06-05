import { MCPRegistry } from "./adapters/MCPRegistry";

export async function initRegistry() {
    console.log("Initializing global node registry...");
    
    // Register example nodes
    
    // Discover and register all other nodes
    await MCPRegistry.discoverAndRegisterAllNodes();
    
    const nodeCount = Object.keys(MCPRegistry.getRegisteredNodes()).length;
    console.log(`Node registry initialized with ${nodeCount} nodes`);
    
    return MCPRegistry.getRegisteredNodes();
}