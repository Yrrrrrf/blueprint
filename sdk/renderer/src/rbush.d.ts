// Ambient module declaration for rbush v4
declare module "rbush" {
	export default class RBush<T> {
		constructor(maxEntries?: number);
		insert(item: T): this;
		load(items: readonly T[]): this;
		remove(item: T, equals?: (a: T, b: T) => boolean): this;
		clear(): this;
		search(bbox: {
			minX: number;
			minY: number;
			maxX: number;
			maxY: number;
		}): T[];
		all(): T[];
		collides(bbox: {
			minX: number;
			minY: number;
			maxX: number;
			maxY: number;
		}): boolean;
		toJSON(): unknown;
		fromJSON(data: unknown): this;
	}
}
