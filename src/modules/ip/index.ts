/**
 * IP Assets Module
 * 
 * Core content management system for intellectual property lifecycle
 */

export { ipAssetsRouter } from './router';
export { ipOwnershipRouter } from './routers/ip-ownership.router';
export { IpAssetService } from './service';
export { IpOwnershipService } from './services/ip-ownership.service';
export { AssetErrors } from './errors';
export * from './types';
export * from './validation';

