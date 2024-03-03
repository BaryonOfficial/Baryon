import * as SWC from "@swc/core";
import { BundleInfo } from "./bundle-info";
import { Options } from "./options";
export declare function transformModule(code: string, ast: SWC.Module, moduleName: string, bundleInfo: BundleInfo, options: Options): SWC.Module;
