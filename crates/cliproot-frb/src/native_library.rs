// Copyright (c) 2026 Cliproot contributors. SPDX-License-Identifier: MIT
use std::{
    ffi::{CString, c_char},
    sync::OnceLock,
};

/// Returns this loaded image's UTF-8 path, borrowed for the image's lifetime.
///
/// Native Assets may rename the binary. FRB must reopen the actual image rather
/// than guess a build-directory path or search process-wide FRB symbols.
#[unsafe(no_mangle)]
pub extern "C" fn cliproot_native_library_path() -> *const c_char {
    static PATH: OnceLock<Option<CString>> = OnceLock::new();
    PATH.get_or_init(image_path)
        .as_ref()
        .map_or(std::ptr::null(), |path| path.as_ptr())
}

#[cfg(unix)]
fn image_path() -> Option<CString> {
    use std::{
        ffi::CStr,
        os::unix::ffi::{OsStrExt, OsStringExt},
    };
    let mut info = std::mem::MaybeUninit::<libc::Dl_info>::uninit();
    // SAFETY: dladdr only uses the address to find its owning image. On success
    // it initializes Dl_info and the loader owns the returned C string.
    let found = unsafe {
        libc::dladdr(
            cliproot_native_library_path as *const () as *const libc::c_void,
            info.as_mut_ptr(),
        )
    };
    if found == 0 {
        return None;
    }
    // SAFETY: a nonzero dladdr return guarantees the output is initialized.
    let info = unsafe { info.assume_init() };
    if info.dli_fname.is_null() {
        return None;
    }
    // SAFETY: the non-null path is a loader-owned, NUL-terminated C string.
    let path = unsafe { CStr::from_ptr(info.dli_fname) };
    let original = std::path::PathBuf::from(std::ffi::OsString::from_vec(path.to_bytes().to_vec()));
    // Android can name an image inside an APK. Keep that loader path when it
    // cannot be canonicalized as an ordinary file.
    let resolved = original.canonicalize().unwrap_or(original);
    CString::new(resolved.as_os_str().as_bytes()).ok()
}

#[cfg(windows)]
fn image_path() -> Option<CString> {
    use windows_sys::Win32::System::LibraryLoader::{
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        GetModuleFileNameW, GetModuleHandleExW,
    };
    let mut module = std::ptr::null_mut();
    // SAFETY: FROM_ADDRESS treats the second argument as an address, not a
    // UTF-16 string. The current call keeps its own image loaded.
    let found = unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            cliproot_native_library_path as *const () as *const u16,
            &mut module,
        )
    };
    if found == 0 {
        return None;
    }
    let mut capacity = 512;
    while capacity <= 32_768 {
        let mut path = vec![0u16; capacity];
        // SAFETY: path has capacity initialized writable UTF-16 elements, and
        // module is the handle returned for this image, without ownership.
        let length =
            unsafe { GetModuleFileNameW(module, path.as_mut_ptr(), capacity as u32) } as usize;
        if length == 0 {
            return None;
        }
        if length < capacity {
            return CString::new(String::from_utf16(&path[..length]).ok()?).ok();
        }
        capacity *= 2;
    }
    None
}

#[cfg(not(any(unix, windows)))]
fn image_path() -> Option<CString> {
    None
}
