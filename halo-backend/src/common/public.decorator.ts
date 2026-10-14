import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const SKIP_DEVICE_CHECK = 'skipDeviceCheck';

/** No auth at all (the health check). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** App key still required, but the device need not be registered yet (registration itself). */
export const SkipDeviceCheck = () => SetMetadata(SKIP_DEVICE_CHECK, true);
