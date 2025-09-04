declare module 'astro:content' {
	interface RenderResult {
		Content: import('astro/runtime/server/index.js').AstroComponentFactory;
		headings: import('astro').MarkdownHeading[];
		remarkPluginFrontmatter: Record<string, any>;
	}
	interface Render {
		'.md': Promise<RenderResult>;
	}

	export interface RenderedContent {
		html: string;
		metadata?: {
			imagePaths: Array<string>;
			[key: string]: unknown;
		};
	}
}

declare module 'astro:content' {
	type Flatten<T> = T extends { [K: string]: infer U } ? U : never;

	export type CollectionKey = keyof AnyEntryMap;
	export type CollectionEntry<C extends CollectionKey> = Flatten<AnyEntryMap[C]>;

	export type ContentCollectionKey = keyof ContentEntryMap;
	export type DataCollectionKey = keyof DataEntryMap;

	type AllValuesOf<T> = T extends any ? T[keyof T] : never;
	type ValidContentEntrySlug<C extends keyof ContentEntryMap> = AllValuesOf<
		ContentEntryMap[C]
	>['slug'];

	/** @deprecated Use `getEntry` instead. */
	export function getEntryBySlug<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		// Note that this has to accept a regular string too, for SSR
		entrySlug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;

	/** @deprecated Use `getEntry` instead. */
	export function getDataEntryById<C extends keyof DataEntryMap, E extends keyof DataEntryMap[C]>(
		collection: C,
		entryId: E,
	): Promise<CollectionEntry<C>>;

	export function getCollection<C extends keyof AnyEntryMap, E extends CollectionEntry<C>>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => entry is E,
	): Promise<E[]>;
	export function getCollection<C extends keyof AnyEntryMap>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => unknown,
	): Promise<CollectionEntry<C>[]>;

	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(entry: {
		collection: C;
		slug: E;
	}): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(entry: {
		collection: C;
		id: E;
	}): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		slug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(
		collection: C,
		id: E,
	): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;

	/** Resolve an array of entry references from the same collection */
	export function getEntries<C extends keyof ContentEntryMap>(
		entries: {
			collection: C;
			slug: ValidContentEntrySlug<C>;
		}[],
	): Promise<CollectionEntry<C>[]>;
	export function getEntries<C extends keyof DataEntryMap>(
		entries: {
			collection: C;
			id: keyof DataEntryMap[C];
		}[],
	): Promise<CollectionEntry<C>[]>;

	export function render<C extends keyof AnyEntryMap>(
		entry: AnyEntryMap[C][string],
	): Promise<RenderResult>;

	export function reference<C extends keyof AnyEntryMap>(
		collection: C,
	): import('astro/zod').ZodEffects<
		import('astro/zod').ZodString,
		C extends keyof ContentEntryMap
			? {
					collection: C;
					slug: ValidContentEntrySlug<C>;
				}
			: {
					collection: C;
					id: keyof DataEntryMap[C];
				}
	>;
	// Allow generic `string` to avoid excessive type errors in the config
	// if `dev` is not running to update as you edit.
	// Invalid collection names will be caught at build time.
	export function reference<C extends string>(
		collection: C,
	): import('astro/zod').ZodEffects<import('astro/zod').ZodString, never>;

	type ReturnTypeOrOriginal<T> = T extends (...args: any[]) => infer R ? R : T;
	type InferEntrySchema<C extends keyof AnyEntryMap> = import('astro/zod').infer<
		ReturnTypeOrOriginal<Required<ContentConfig['collections'][C]>['schema']>
	>;

	type ContentEntryMap = {
		"trends": {
"2025/09/01/bar-restoration.md": {
	id: "2025/09/01/bar-restoration.md";
  slug: "bar-restoration";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/billionaire-mark-cuban-says-that-companies-dont-understand-how-to-implement-ai-r.md": {
	id: "2025/09/01/billionaire-mark-cuban-says-that-companies-dont-understand-how-to-implement-ai-r.md";
  slug: "billionaire-mark-cuban-says-that-companies-dont-understand-how-to-implement-ai-r";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/call-before-you-dig-tags.md": {
	id: "2025/09/01/call-before-you-dig-tags.md";
  slug: "call-before-you-dig-tags";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/can-you-use-enhet-as-a-wall-mounted-tv-unit.md": {
	id: "2025/09/01/can-you-use-enhet-as-a-wall-mounted-tv-unit.md";
  slug: "can-you-use-enhet-as-a-wall-mounted-tv-unit";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/chinese-esports-firm-worked-with-amd-on-1-000-hz-gaming-monitor-primed-for-2026-debut.md": {
	id: "2025/09/01/chinese-esports-firm-worked-with-amd-on-1-000-hz-gaming-monitor-primed-for-2026-debut.md";
  slug: "chinese-esports-firm-worked-with-amd-on-1-000-hz-gaming-monitor-primed-for-2026-debut";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/compact-android-tablet-for-under-100-in-review-lenovo-tab-one-review.md": {
	id: "2025/09/01/compact-android-tablet-for-under-100-in-review-lenovo-tab-one-review.md";
  slug: "compact-android-tablet-for-under-100-in-review-lenovo-tab-one-review";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/continual-improvement.md": {
	id: "2025/09/01/continual-improvement.md";
  slug: "continual-improvement";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/dji-osmo-pocket-4-rears-its-head-with-two-major-upgrades.md": {
	id: "2025/09/01/dji-osmo-pocket-4-rears-its-head-with-two-major-upgrades.md";
  slug: "dji-osmo-pocket-4-rears-its-head-with-two-major-upgrades";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/does-it-make-sense-to-only-buy-from-one-brand-when-you-find-one-that-you-really-.md": {
	id: "2025/09/01/does-it-make-sense-to-only-buy-from-one-brand-when-you-find-one-that-you-really-.md";
  slug: "does-it-make-sense-to-only-buy-from-one-brand-when-you-find-one-that-you-really-";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/get-an-under-sink-silicone-mat-and-leak-sensor.md": {
	id: "2025/09/01/get-an-under-sink-silicone-mat-and-leak-sensor.md";
  slug: "get-an-under-sink-silicone-mat-and-leak-sensor";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/help-basement-smell-is-transferring-to-clothes-while-theyre-in-the-dryer.md": {
	id: "2025/09/01/help-basement-smell-is-transferring-to-clothes-while-theyre-in-the-dryer.md";
  slug: "help-basement-smell-is-transferring-to-clothes-while-theyre-in-the-dryer";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/high-quality-durable-brands.md": {
	id: "2025/09/01/high-quality-durable-brands.md";
  slug: "high-quality-durable-brands";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/i-feel-stupid-popcorn-ceilings-being-dry-scraped.md": {
	id: "2025/09/01/i-feel-stupid-popcorn-ceilings-being-dry-scraped.md";
  slug: "i-feel-stupid-popcorn-ceilings-being-dry-scraped";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/iphone-17-pro-clear-case-may-feature-redesign-and-possibly-tinted-options.md": {
	id: "2025/09/01/iphone-17-pro-clear-case-may-feature-redesign-and-possibly-tinted-options.md";
  slug: "iphone-17-pro-clear-case-may-feature-redesign-and-possibly-tinted-options";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/is-it-possible-to-build-a-custom-closet-system-that-you-can-take-with-you-when-y.md": {
	id: "2025/09/01/is-it-possible-to-build-a-custom-closet-system-that-you-can-take-with-you-when-y.md";
  slug: "is-it-possible-to-build-a-custom-closet-system-that-you-can-take-with-you-when-y";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/mens-casual-pants.md": {
	id: "2025/09/01/mens-casual-pants.md";
  slug: "mens-casual-pants";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/my-home-gym-so-far.md": {
	id: "2025/09/01/my-home-gym-so-far.md";
  slug: "my-home-gym-so-far";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/nvidia-says-two-mystery-customers-accounted-for-of-q2-revenue.md": {
	id: "2025/09/01/nvidia-says-two-mystery-customers-accounted-for-of-q2-revenue.md";
  slug: "nvidia-says-two-mystery-customers-accounted-for-of-q2-revenue";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/phase-5-complete-now-i-need-more-space.md": {
	id: "2025/09/01/phase-5-complete-now-i-need-more-space.md";
  slug: "phase-5-complete-now-i-need-more-space";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/pivooooot.md": {
	id: "2025/09/01/pivooooot.md";
  slug: "pivooooot";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/reolink-elite-floodlight-wifi-review-a-top-tier-light-and-security-camera.md": {
	id: "2025/09/01/reolink-elite-floodlight-wifi-review-a-top-tier-light-and-security-camera.md";
  slug: "reolink-elite-floodlight-wifi-review-a-top-tier-light-and-security-camera";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/samsung-confirms-when-one-ui-8-will-be-released-for-your-device.md": {
	id: "2025/09/01/samsung-confirms-when-one-ui-8-will-be-released-for-your-device.md";
  slug: "samsung-confirms-when-one-ui-8-will-be-released-for-your-device";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/trumps-new-plan-for-medicare-let-ai-decide-whether-you-should-be-covered-or-not-.md": {
	id: "2025/09/01/trumps-new-plan-for-medicare-let-ai-decide-whether-you-should-be-covered-or-not-.md";
  slug: "trumps-new-plan-for-medicare-let-ai-decide-whether-you-should-be-covered-or-not-";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/unifi-as-mesh-router.md": {
	id: "2025/09/01/unifi-as-mesh-router.md";
  slug: "unifi-as-mesh-router";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/what-are-cheap-broke-conscious-stores-in-the-eu-but-with-passable-quality.md": {
	id: "2025/09/01/what-are-cheap-broke-conscious-stores-in-the-eu-but-with-passable-quality.md";
  slug: "what-are-cheap-broke-conscious-stores-in-the-eu-but-with-passable-quality";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/01/why-are-my-shirts-doing-this.md": {
	id: "2025/09/01/why-are-my-shirts-doing-this.md";
  slug: "why-are-my-shirts-doing-this";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/age-verification-legislation-is-tanking-traffic-to-sites-that-comply-and-rewardi.md": {
	id: "2025/09/02/age-verification-legislation-is-tanking-traffic-to-sites-that-comply-and-rewardi.md";
  slug: "age-verification-legislation-is-tanking-traffic-to-sites-that-comply-and-rewardi";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/apple-hints-at-iphone-17-models-lacking-sim-card-slot-in-more-countries.md": {
	id: "2025/09/02/apple-hints-at-iphone-17-models-lacking-sim-card-slot-in-more-countries.md";
  slug: "apple-hints-at-iphone-17-models-lacking-sim-card-slot-in-more-countries";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/apple-just-released-a-new-ai-chatbot-to-help-retail-employees-sell-iphones.md": {
	id: "2025/09/02/apple-just-released-a-new-ai-chatbot-to-help-retail-employees-sell-iphones.md";
  slug: "apple-just-released-a-new-ai-chatbot-to-help-retail-employees-sell-iphones";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/apple-tv-4k-doesn-t-work-as-a-hub.md": {
	id: "2025/09/02/apple-tv-4k-doesn-t-work-as-a-hub.md";
  slug: "apple-tv-4k-doesn-t-work-as-a-hub";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/auriculares-inalambricos-con-cancelacion-de-ruido.md": {
	id: "2025/09/02/auriculares-inalambricos-con-cancelacion-de-ruido.md";
  slug: "auriculares-inalambricos-con-cancelacion-de-ruido";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/bad-or-horrible-my-parent-s-basement.md": {
	id: "2025/09/02/bad-or-horrible-my-parent-s-basement.md";
  slug: "bad-or-horrible-my-parent-s-basement";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/bad-or-horrible-my-parents-basement.md": {
	id: "2025/09/02/bad-or-horrible-my-parents-basement.md";
  slug: "bad-or-horrible-my-parents-basement";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/best-rack-configuration.md": {
	id: "2025/09/02/best-rack-configuration.md";
  slug: "best-rack-configuration";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/cafetera-de-capsulas-compacta.md": {
	id: "2025/09/02/cafetera-de-capsulas-compacta.md";
  slug: "cafetera-de-capsulas-compacta";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/camara-de-seguridad-wifi-para-exterior.md": {
	id: "2025/09/02/camara-de-seguridad-wifi-para-exterior.md";
  slug: "camara-de-seguridad-wifi-para-exterior";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/daily-discussion-thread.md": {
	id: "2025/09/02/daily-discussion-thread.md";
  slug: "daily-discussion-thread";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/daily-simple-questions-thread.md": {
	id: "2025/09/02/daily-simple-questions-thread.md";
  slug: "daily-simple-questions-thread";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/disco-ssd-nvme-1-tb-alta-velocidad.md": {
	id: "2025/09/02/disco-ssd-nvme-1-tb-alta-velocidad.md";
  slug: "disco-ssd-nvme-1-tb-alta-velocidad";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/do-i-need-something-above-the-tv-if-so-what.md": {
	id: "2025/09/02/do-i-need-something-above-the-tv-if-so-what.md";
  slug: "do-i-need-something-above-the-tv-if-so-what";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/do-you-care-how-your-clothes-are-made-or-just-how-they-look-on-you.md": {
	id: "2025/09/02/do-you-care-how-your-clothes-are-made-or-just-how-they-look-on-you.md";
  slug: "do-you-care-how-your-clothes-are-made-or-just-how-they-look-on-you";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/dress-shirts-under-140.md": {
	id: "2025/09/02/dress-shirts-under-140.md";
  slug: "dress-shirts-under-140";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/dress-shirts-under-dollar140.md": {
	id: "2025/09/02/dress-shirts-under-dollar140.md";
  slug: "dress-shirts-under-dollar140";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/drop-in-tub-regret.md": {
	id: "2025/09/02/drop-in-tub-regret.md";
  slug: "drop-in-tub-regret";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/freidora-de-aire-5-litros.md": {
	id: "2025/09/02/freidora-de-aire-5-litros.md";
  slug: "freidora-de-aire-5-litros";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/how-much-to-smooth-out-slope-of-a-backyard-or-regrade.md": {
	id: "2025/09/02/how-much-to-smooth-out-slope-of-a-backyard-or-regrade.md";
  slug: "how-much-to-smooth-out-slope-of-a-backyard-or-regrade";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/how-not-to-look-like-a-suburban-minivan-driving-boring-dad.md": {
	id: "2025/09/02/how-not-to-look-like-a-suburban-minivan-driving-boring-dad.md";
  slug: "how-not-to-look-like-a-suburban-minivan-driving-boring-dad";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/iphone-17-cases-allegedly-reveal-holes-for-crossbody-strap.md": {
	id: "2025/09/02/iphone-17-cases-allegedly-reveal-holes-for-crossbody-strap.md";
  slug: "iphone-17-cases-allegedly-reveal-holes-for-crossbody-strap";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/kuo-reiterates-touch-id-in-the-iphone-fold-unlikely-to-be-in-display.md": {
	id: "2025/09/02/kuo-reiterates-touch-id-in-the-iphone-fold-unlikely-to-be-in-display.md";
  slug: "kuo-reiterates-touch-id-in-the-iphone-fold-unlikely-to-be-in-display";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/lampara-led-regulable-escritorio.md": {
	id: "2025/09/02/lampara-led-regulable-escritorio.md";
  slug: "lampara-led-regulable-escritorio";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/little-diy-deadlift-platform-project.md": {
	id: "2025/09/02/little-diy-deadlift-platform-project.md";
  slug: "little-diy-deadlift-platform-project";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/meta-might-be-scanning-your-phone-s-entire-camera-roll.md": {
	id: "2025/09/02/meta-might-be-scanning-your-phone-s-entire-camera-roll.md";
  slug: "meta-might-be-scanning-your-phone-s-entire-camera-roll";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/meta-might-be-scanning-your-phones-entire-camera-roll.md": {
	id: "2025/09/02/meta-might-be-scanning-your-phones-entire-camera-roll.md";
  slug: "meta-might-be-scanning-your-phones-entire-camera-roll";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/monitor-27-pulgadas-144-hz-para-gaming.md": {
	id: "2025/09/02/monitor-27-pulgadas-144-hz-para-gaming.md";
  slug: "monitor-27-pulgadas-144-hz-para-gaming";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/my-tailor-passed-away.md": {
	id: "2025/09/02/my-tailor-passed-away.md";
  slug: "my-tailor-passed-away";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/next-door-neighbor-has-older-friends-come-over-when-they-leave-they-hit-my-mailb.md": {
	id: "2025/09/02/next-door-neighbor-has-older-friends-come-over-when-they-leave-they-hit-my-mailb.md";
  slug: "next-door-neighbor-has-older-friends-come-over-when-they-leave-they-hit-my-mailb";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/purificador-de-aire-hepa.md": {
	id: "2025/09/02/purificador-de-aire-hepa.md";
  slug: "purificador-de-aire-hepa";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/revopoint-launches-3-new-3d-scanners-inspire-2-giveaway.md": {
	id: "2025/09/02/revopoint-launches-3-new-3d-scanners-inspire-2-giveaway.md";
  slug: "revopoint-launches-3-new-3d-scanners-inspire-2-giveaway";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/robot-aspirador-con-mapeo-laser.md": {
	id: "2025/09/02/robot-aspirador-con-mapeo-laser.md";
  slug: "robot-aspirador-con-mapeo-laser";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/started-assembling-my-brand-new-besta-tv-console-and.md": {
	id: "2025/09/02/started-assembling-my-brand-new-besta-tv-console-and.md";
  slug: "started-assembling-my-brand-new-besta-tv-console-and";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/started-from-very-little.md": {
	id: "2025/09/02/started-from-very-little.md";
  slug: "started-from-very-little";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/tablet-android-compacta-para-estudiar.md": {
	id: "2025/09/02/tablet-android-compacta-para-estudiar.md";
  slug: "tablet-android-compacta-para-estudiar";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/the-ultra-cameraphone-comparison-oppo-vs-samsung-vs-xiaomi-vs-vivo-vs-huawei.md": {
	id: "2025/09/02/the-ultra-cameraphone-comparison-oppo-vs-samsung-vs-xiaomi-vs-vivo-vs-huawei.md";
  slug: "the-ultra-cameraphone-comparison-oppo-vs-samsung-vs-xiaomi-vs-vivo-vs-huawei";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/thorbolt-review.md": {
	id: "2025/09/02/thorbolt-review.md";
  slug: "thorbolt-review";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/trump-admin-wants-to-own-patents-of-new-inventions-in-exchange-for-university-fu.md": {
	id: "2025/09/02/trump-admin-wants-to-own-patents-of-new-inventions-in-exchange-for-university-fu.md";
  slug: "trump-admin-wants-to-own-patents-of-new-inventions-in-exchange-for-university-fu";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/what-causes-the-bottom-30cm-of-basement-support-columns-to-rust.md": {
	id: "2025/09/02/what-causes-the-bottom-30cm-of-basement-support-columns-to-rust.md";
  slug: "what-causes-the-bottom-30cm-of-basement-support-columns-to-rust";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/what-s-one-trend-you-hope-does-make-a-comeback.md": {
	id: "2025/09/02/what-s-one-trend-you-hope-does-make-a-comeback.md";
  slug: "what-s-one-trend-you-hope-does-make-a-comeback";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/whats-one-trend-you-hope-does-make-a-comeback.md": {
	id: "2025/09/02/whats-one-trend-you-hope-does-make-a-comeback.md";
  slug: "whats-one-trend-you-hope-does-make-a-comeback";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/youtube-is-now-flagging-accounts-on-premium-family-plans-that-aren-t-in-the-same.md": {
	id: "2025/09/02/youtube-is-now-flagging-accounts-on-premium-family-plans-that-aren-t-in-the-same.md";
  slug: "youtube-is-now-flagging-accounts-on-premium-family-plans-that-aren-t-in-the-same";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/02/youtube-is-now-flagging-accounts-on-premium-family-plans-that-arent-in-the-same-.md": {
	id: "2025/09/02/youtube-is-now-flagging-accounts-on-premium-family-plans-that-arent-in-the-same-.md";
  slug: "youtube-is-now-flagging-accounts-on-premium-family-plans-that-arent-in-the-same-";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/bought-a-house-a-year-ago-what-maintenance-do-i-need-to-be-aware-of.md": {
	id: "2025/09/04/bought-a-house-a-year-ago-what-maintenance-do-i-need-to-be-aware-of.md";
  slug: "bought-a-house-a-year-ago-what-maintenance-do-i-need-to-be-aware-of";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/favorite-heavyweight-t-shirts.md": {
	id: "2025/09/04/favorite-heavyweight-t-shirts.md";
  slug: "favorite-heavyweight-t-shirts";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/first-home-gym.md": {
	id: "2025/09/04/first-home-gym.md";
  slug: "first-home-gym";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/freak-athlete-abx-final-pre-production-testing-in-progress.md": {
	id: "2025/09/04/freak-athlete-abx-final-pre-production-testing-in-progress.md";
  slug: "freak-athlete-abx-final-pre-production-testing-in-progress";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/garmin-s-fenix-8-pro-series-finally-lets-you-leave-your-phone-at-home-sort-of.md": {
	id: "2025/09/04/garmin-s-fenix-8-pro-series-finally-lets-you-leave-your-phone-at-home-sort-of.md";
  slug: "garmin-s-fenix-8-pro-series-finally-lets-you-leave-your-phone-at-home-sort-of";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/gyroscopic-backpack-spins-up-a-solution-to-balance-problems.md": {
	id: "2025/09/04/gyroscopic-backpack-spins-up-a-solution-to-balance-problems.md";
  slug: "gyroscopic-backpack-spins-up-a-solution-to-balance-problems";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/home-gym-upgrade-complete.md": {
	id: "2025/09/04/home-gym-upgrade-complete.md";
  slug: "home-gym-upgrade-complete";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/how-would-you-respond-to-a-landscaping-contractor-that-said-they-wouldn-t-remove.md": {
	id: "2025/09/04/how-would-you-respond-to-a-landscaping-contractor-that-said-they-wouldn-t-remove.md";
  slug: "how-would-you-respond-to-a-landscaping-contractor-that-said-they-wouldn-t-remove";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/if-you-could-only-wear-one-pair-of-sunglasses-for-the-rest-of-your-life-which-on.md": {
	id: "2025/09/04/if-you-could-only-wear-one-pair-of-sunglasses-for-the-rest-of-your-life-which-on.md";
  slug: "if-you-could-only-wear-one-pair-of-sunglasses-for-the-rest-of-your-life-which-on";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/jbl-just-announced-its-largest-ever-battery-powered-party-speaker.md": {
	id: "2025/09/04/jbl-just-announced-its-largest-ever-battery-powered-party-speaker.md";
  slug: "jbl-just-announced-its-largest-ever-battery-powered-party-speaker";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/just-finished-of-my-recent-diy-master-bathroom-remodel-very-happy-my-vision-came.md": {
	id: "2025/09/04/just-finished-of-my-recent-diy-master-bathroom-remodel-very-happy-my-vision-came.md";
  slug: "just-finished-of-my-recent-diy-master-bathroom-remodel-very-happy-my-vision-came";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/mountain-top-gym.md": {
	id: "2025/09/04/mountain-top-gym.md";
  slug: "mountain-top-gym";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/my-weekend-cabinet-repaint-is-a-peeling-nightmare-what-did-i-screw-up.md": {
	id: "2025/09/04/my-weekend-cabinet-repaint-is-a-peeling-nightmare-what-did-i-screw-up.md";
  slug: "my-weekend-cabinet-repaint-is-a-peeling-nightmare-what-did-i-screw-up";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/sony-to-downgrade-ps5-with-less-storage-for-the-same-price-claims-leak.md": {
	id: "2025/09/04/sony-to-downgrade-ps5-with-less-storage-for-the-same-price-claims-leak.md";
  slug: "sony-to-downgrade-ps5-with-less-storage-for-the-same-price-claims-leak";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/suit-traditions-english-vs-italian-vs-american-cuts-what-s-the-real-difference-i.md": {
	id: "2025/09/04/suit-traditions-english-vs-italian-vs-american-cuts-what-s-the-real-difference-i.md";
  slug: "suit-traditions-english-vs-italian-vs-american-cuts-what-s-the-real-difference-i";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/tesco-tries-out-in-store-avocado-scanners-to-assess-ripeness.md": {
	id: "2025/09/04/tesco-tries-out-in-store-avocado-scanners-to-assess-ripeness.md";
  slug: "tesco-tries-out-in-store-avocado-scanners-to-assess-ripeness";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/well-that-was-a-nightmare-building.md": {
	id: "2025/09/04/well-that-was-a-nightmare-building.md";
  slug: "well-that-was-a-nightmare-building";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/what-casual-piece-of-clothing-defines-your-country-s-look.md": {
	id: "2025/09/04/what-casual-piece-of-clothing-defines-your-country-s-look.md";
  slug: "what-casual-piece-of-clothing-defines-your-country-s-look";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/which-streetwear-luxury-brands-are-the-highest-quality.md": {
	id: "2025/09/04/which-streetwear-luxury-brands-are-the-highest-quality.md";
  slug: "which-streetwear-luxury-brands-are-the-highest-quality";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
"2025/09/04/why-would-a-skunk-be-spraying-every-night-near-my-house.md": {
	id: "2025/09/04/why-would-a-skunk-be-spraying-every-night-near-my-house.md";
  slug: "why-would-a-skunk-be-spraying-every-night-near-my-house";
  body: string;
  collection: "trends";
  data: any
} & { render(): Render[".md"] };
};

	};

	type DataEntryMap = {
		
	};

	type AnyEntryMap = ContentEntryMap & DataEntryMap;

	export type ContentConfig = never;
}
