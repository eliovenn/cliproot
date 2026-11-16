/* Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT */
#ifndef CLIPROOT_NATIVE_LIBRARY_H
#define CLIPROOT_NATIVE_LIBRARY_H

#ifdef __cplusplus
extern "C" {
#endif

/* Borrowed UTF-8 image path. NULL means the loader could not resolve it. */
const char *cliproot_native_library_path(void);

#ifdef __cplusplus
}
#endif

#endif
