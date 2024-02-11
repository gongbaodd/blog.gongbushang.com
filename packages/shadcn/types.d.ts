declare function mergeConfigs<ClassGroupIds extends string, ThemeGroupIds extends string = never>(baseConfig: GenericConfig, { cacheSize, prefix, separator, extend, override, }: ConfigExtension<ClassGroupIds, ThemeGroupIds>): GenericConfig;

declare const twMerge: (...classLists: ClassNameValue[]) => string;
