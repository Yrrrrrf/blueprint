// Ambient declarations for IndexedDB API in non-browser Deno environments

interface IDBRequest<T = unknown> {
	result: T;
	error: DOMException | null;
	source: unknown;
	transaction: IDBTransaction | null;
	readyState: "pending" | "done";
	onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
	onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
}

interface IDBOpenDBRequest extends IDBRequest<IDBDatabase> {
	onupgradeneeded:
		| ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown)
		| null;
	onblocked: ((this: IDBOpenDBRequest, ev: Event) => unknown) | null;
}

interface IDBVersionChangeEvent extends Event {
	readonly oldVersion: number;
	readonly newVersion: number | null;
}

interface IDBTransaction {
	readonly db: IDBDatabase;
	readonly mode: "readonly" | "readwrite" | "versionchange";
	readonly error: DOMException | null;
	objectStore(name: string): IDBObjectStore;
	abort(): void;
	oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null;
	onerror: ((this: IDBTransaction, ev: Event) => unknown) | null;
	onabort: ((this: IDBTransaction, ev: Event) => unknown) | null;
}

interface IDBObjectStore {
	readonly name: string;
	readonly keyPath: string | readonly string[];
	get(query: unknown): IDBRequest<unknown>;
	getAll(query?: unknown, count?: number): IDBRequest<unknown[]>;
	put(value: unknown, key?: unknown): IDBRequest<unknown>;
	add(value: unknown, key?: unknown): IDBRequest<unknown>;
	delete(query: unknown): IDBRequest<undefined>;
	clear(): IDBRequest<undefined>;
	openCursor(
		query?: unknown,
		direction?: "next" | "nextunique" | "prev" | "prevunique",
	): IDBRequest<IDBCursorWithValue | null>;
}

interface IDBCursorWithValue {
	readonly key: unknown;
	readonly primaryKey: unknown;
	readonly value: unknown;
	continue(): void;
	delete(): IDBRequest<undefined>;
}

interface IDBDatabase {
	readonly name: string;
	readonly version: number;
	readonly objectStoreNames: {
		contains(name: string): boolean;
		readonly length: number;
		item(index: number): string | null;
	};
	transaction(
		storeNames: string | readonly string[],
		mode?: "readonly" | "readwrite",
	): IDBTransaction;
	createObjectStore(
		name: string,
		options?: { keyPath?: string | readonly string[]; autoIncrement?: boolean },
	): IDBObjectStore;
	deleteObjectStore(name: string): void;
	close(): void;
}

interface IDBFactory {
	open(name: string, version?: number): IDBOpenDBRequest;
	deleteDatabase(name: string): IDBOpenDBRequest;
	databases?(): Promise<Array<{ name: string; version: number }>>;
}

declare const indexedDB: IDBFactory | undefined;
