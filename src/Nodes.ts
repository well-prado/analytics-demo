
import ApiCall from "@nanoservice-ts/api-call";
import IfElse from "@nanoservice-ts/if-else";
import type { NodeBase } from "@nanoservice-ts/shared";
import ExampleNodes from "./nodes/examples";

// Import analytics nodes
import DatabaseConfigNode from "./nodes/analytics/database-config";
import SchemaDiscoveryNode from "./nodes/analytics/schema-discovery";
import BusinessContextQueryNode from "./nodes/analytics/business-context-query";

const nodes: {
	[key: string]: NodeBase;
} = {
	"@nanoservice-ts/api-call": new ApiCall(),
	"@nanoservice-ts/if-else": new IfElse(),
	...ExampleNodes,
	// Analytics nodes
	"database-config": new DatabaseConfigNode(),
	"schema-discovery": new SchemaDiscoveryNode(),
	"business-context-query": new BusinessContextQueryNode(),
};

export default nodes;
