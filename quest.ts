// @ts-nocheck
declare const ptr: any;
declare const Interceptor: any;
declare const Module: any;
declare const Memory: any;
declare const NativeFunction: any;
declare const Script: any;

const QUEST_PLATFORM = 1;
const SYMBOLS_URL = "https://pastebin.com/raw/cYuLJFs9";

function parseUrl(url: string): {
  hostname: string;
  path: string;
  port: number;
} {
  const match = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?(.*)$/);
  if (!match) {
    return { hostname: "", path: "/", port: 443 };
  }
  const hostname = match[1];
  const port = match[2]
    ? parseInt(match[2])
    : url.startsWith("https")
      ? 443  
      : 80;
  const path = match[3] || "/";
  return { hostname, path, port };
}

function httpRequest(
  url: string,
  method: string,
  headers: any,
  body?: string,  
): Promise<{ status: number; data: string }> {
  return new Promise((resolve) => {
    try {
      const winhttp = Module.load("winhttp.dll");

      const WinHttpOpen = new NativeFunction(
        winhttp.getExportByName("WinHttpOpen"),
        "pointer",
        ["pointer", "uint32", "pointer", "pointer", "uint32"],
      );

      const WinHttpConnect = new NativeFunction(
        winhttp.getExportByName("WinHttpConnect"),
        "pointer",
        ["pointer", "pointer", "uint32", "uint32"],
      );  

      const WinHttpOpenRequest = new NativeFunction(
        winhttp.getExportByName("WinHttpOpenRequest"),
        "pointer",
        [
          "pointer",
          "pointer",
          "pointer",
          "pointer",
          "pointer",
          "pointer",
          "uint32",
        ],
      );

      const WinHttpSendRequest = new NativeFunction(
        winhttp.getExportByName("WinHttpSendRequest"),
        "bool",
        [
          "pointer",
          "pointer",  
          "uint32",
          "pointer",
          "uint32",
          "uint32",
          "pointer",
        ],
      );

      const WinHttpReceiveResponse = new NativeFunction(
        winhttp.getExportByName("WinHttpReceiveResponse"),
        "bool",
        ["pointer", "pointer"],
      );

      const WinHttpQueryHeaders = new NativeFunction(
        winhttp.getExportByName("WinHttpQueryHeaders"),  
        "bool",
        ["pointer", "uint32", "pointer", "pointer", "pointer", "pointer"],
      );

      const WinHttpReadData = new NativeFunction(  
        winhttp.getExportByName("WinHttpReadData"),
        "bool",
        ["pointer", "pointer", "uint32", "pointer"],
      );

      const WinHttpCloseHandle = new NativeFunction(
        winhttp.getExportByName("WinHttpCloseHandle"),  
        "bool",
        ["pointer"],
      );

      const WinHttpSetOption = new NativeFunction(
        winhttp.getExportByName("WinHttpSetOption"),
        "bool",
        ["pointer", "uint32", "pointer", "uint32"],
      );

      const WinHttpSetTimeouts = new NativeFunction(
        winhttp.getExportByName("WinHttpSetTimeouts"),
        "bool",
        ["pointer", "int32", "int32", "int32", "int32"],
      );

      const GetLastError = new NativeFunction(
        Module.load("kernel32.dll").getExportByName("GetLastError"),
        "uint32",
        [],
      );

      const urlParts = parseUrl(url);
      const hostname = urlParts.hostname;
      const path = urlParts.path;
      const port = urlParts.port;

      const userAgent = Memory.allocUtf16String(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );
      const hSession = WinHttpOpen(userAgent, 0, ptr(0), ptr(0), 0);

      if (hSession.isNull()) {
        resolve({
          status: 0,
          data: "WinHttpOpen failed (" + GetLastError() + ")",
        });
        return;
      }

      WinHttpSetTimeouts(hSession, 5000, 5000, 5000, 5000);

      const hostnameW = Memory.allocUtf16String(hostname);
      const hConnect = WinHttpConnect(hSession, hostnameW, port, 0);

      if (hConnect.isNull()) {
        WinHttpCloseHandle(hSession);
        resolve({ status: 0, data: "WinHttpConnect failed" });
        return;
      }

      const pathW = Memory.allocUtf16String(path);
      const methodW = Memory.allocUtf16String(method);
      const hRequest = WinHttpOpenRequest(
        hConnect,
        methodW,
        pathW,
        ptr(0),
        ptr(0),
        ptr(0),
        url.startsWith("https") ? 0x00800000 : 0,
      );

      if (hRequest.isNull()) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        resolve({ status: 0, data: "WinHttpOpenRequest failed" });
        return;
      }

      const flagsBuf = Memory.alloc(4);
      flagsBuf.writeU32(0x00000100 | 0x00000200 | 0x00001000 | 0x00002000);
      WinHttpSetOption(hRequest, 31, flagsBuf, 4);

      let headersStr = "";
      for (const key in headers) {
        headersStr += key + ": " + headers[key] + "\r\n";
      }
      const headersW = Memory.allocUtf16String(headersStr);

      const bodyPtr = body ? Memory.allocUtf8String(body) : ptr(0);
      const bodyLen = body ? body.length : 0;

      if (
        !WinHttpSendRequest(
          hRequest,
          headersW,
          -1,
          bodyPtr,
          bodyLen,
          bodyLen,
          ptr(0),
        )
      ) {
        const err = GetLastError();
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        resolve({ status: 0, data: "WinHttpSendRequest failed (" + err + ")" });
        return;
      }

      if (!WinHttpReceiveResponse(hRequest, ptr(0))) {
        const err = GetLastError();
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        resolve({
          status: 0,
          data: "WinHttpReceiveResponse failed (" + err + ")",
        });
        return;
      }

      const statusBuffer = Memory.alloc(4);
      const statusSize = Memory.alloc(4);
      statusSize.writeU32(4);

      WinHttpQueryHeaders(
        hRequest,
        0x20000013,
        ptr(0),
        statusBuffer,
        statusSize,
        ptr(0),
      );
      const statusCode = statusBuffer.readU32();

      const buffer = Memory.alloc(8192);
      const bytesRead = Memory.alloc(4);
      let responseData = "";

      while (WinHttpReadData(hRequest, buffer, 8192, bytesRead)) {
        const size = bytesRead.readU32();
        if (size === 0) break;
        responseData += buffer.readUtf8String(size);
      }

      WinHttpCloseHandle(hRequest);
      WinHttpCloseHandle(hConnect);
      WinHttpCloseHandle(hSession);

      resolve({ status: statusCode, data: responseData });
    } catch (e) {
      console.log("[-] HTTP request error: " + e);
      resolve({ status: 0, data: "Error: " + e });
    }
  });
}

async function loadQuestServers() {
  console.log("\n");
  console.log("------------------------------");
  console.log("[+] Connected to Quest Servers");
  console.log("[+] Made ItzDaTree");
  console.log("------------------------------");

  const symResponse = await httpRequest(SYMBOLS_URL, "GET", {});
  if (symResponse.status === 200) {
    try {
      eval(symResponse.data);

      const mapping: any = {
        il2cpp_init: "PLLxa_NiSMh",
        il2cpp_init_utf16: "vJWFEeQBDoN",
        il2cpp_shutdown: "nVBeiPDvnsP",
        il2cpp_set_config_dir: "YiwFePQFiFO",
        il2cpp_set_data_dir: "OKdudbTVwSG",
        il2cpp_set_temp_dir: "oIsMUshXTnJ",
        il2cpp_set_commandline_arguments: "bktKReYeYec",
        il2cpp_set_commandline_arguments_utf16: "tyhzRWiErhl",
        il2cpp_set_config_utf16: "HRfPukJR_Zc",
        il2cpp_set_config: "AMXBynmUBcJ",
        il2cpp_set_memory_callbacks: "liZIWoFdpux",
        il2cpp_memory_pool_set_region_size: "TxfDogyxazY",
        il2cpp_memory_pool_get_region_size: "cGiVugZdnKD",
        il2cpp_get_corlib: "XHpONuYuewd",
        il2cpp_add_internal_call: "fIEazTkDPcb",
        il2cpp_resolve_icall: "nS_TCKczwxo",
        il2cpp_alloc: "QjnjQryPSos",
        il2cpp_free: "T_tvrLRYvdw",
        il2cpp_array_class_get: "VyfQNsHqTeB",
        il2cpp_array_length: "EBqlNBHbOsz",
        il2cpp_array_get_byte_length: "zQKKsFyBUFZ",
        il2cpp_array_new: "NEhnaXiVyfc",
        il2cpp_array_new_specific: "ljJpdgTKgWd",
        il2cpp_array_new_full: "mmtesSziEka",
        il2cpp_bounded_array_class_get: "xYxjjmtgABQ",
        il2cpp_array_element_size: "zKbhkJAaF__",
        il2cpp_assembly_get_image: "uQQruUuTsRg",
        il2cpp_class_for_each: "_FIEbFgRtVa",
        il2cpp_class_enum_basetype: "nBSzxYUpDAc",
        il2cpp_class_is_inited: "xcSoNaNUtjF",
        il2cpp_class_is_generic: "PBqDXBIppNz",
        il2cpp_class_is_inflated: "ZVWKbAeYLuT",
        il2cpp_class_is_assignable_from: "oduHuesXtzk",
        il2cpp_class_is_subclass_of: "irtdXkpYKUL",
        il2cpp_class_has_parent: "QgQRwpZcJPM",
        il2cpp_class_from_il2cpp_type: "tYXa_LcBRKz",
        il2cpp_class_from_name: "c_AYgUiCmQz",
        il2cpp_class_from_system_type: "fQjxiDzALbW",
        il2cpp_class_get_element_class: "qLgpCJPEjVC",
        il2cpp_class_get_events: "EJURvayMIos",
        il2cpp_class_get_fields: "FmDdLfcpCnr",
        il2cpp_class_get_nested_types: "szPTLbu_fxw",
        il2cpp_class_get_interfaces: "fWZWaqfOXEr",
        il2cpp_class_get_properties: "kLHsSYLFLDI",
        il2cpp_class_get_property_from_name: "dlXkAYSuS_K",
        il2cpp_class_get_field_from_name: "sfguajuTpMH",
        il2cpp_class_get_methods: "oNmhcyTwvIB",
        il2cpp_class_get_method_from_name: "zbJbuNXQRaG",
        il2cpp_class_get_name: "GMGhzhVfqVe",
        il2cpp_type_get_name_chunked: "wwAaEvDJVBI",
        il2cpp_class_get_namespace: "GxyukbimvHI",
        il2cpp_class_get_parent: "mOeZMWqrUrU",
        il2cpp_class_get_declaring_type: "IWUyxGBjhSu",
        il2cpp_class_instance_size: "ZFlEvKbHBSD",
        il2cpp_class_num_fields: "dyD_HyJPJsh",
        il2cpp_class_is_valuetype: "MyxIJKuYYPQ",
        il2cpp_class_value_size: "njLDYza_ldr",
        il2cpp_class_is_blittable: "mqbVHXhfQLE",
        il2cpp_class_get_flags: "vxWodKSoxPY",
        il2cpp_class_is_abstract: "eoxTSHgzjet",
        il2cpp_class_is_interface: "LfDarZRwFuP",
        il2cpp_class_array_element_size: "IzwsNRSqUJM",
        il2cpp_class_from_type: "aMQZLhwgBAi",
        il2cpp_class_get_type: "P_kLAvhfLDV",
        il2cpp_class_get_type_token: "ugSFSJPLwAz",
        il2cpp_class_has_attribute: "hMtOQzeTWRa",
        il2cpp_class_has_references: "sAnbEsSgkyH",
        il2cpp_class_is_enum: "YxiBnHqwcOO",
        il2cpp_class_get_image: "tPvu_GmTOQl",
        il2cpp_class_get_assemblyname: "mplpmNMbPVc",
        il2cpp_class_get_rank: "zfxACcqAnIC",
        il2cpp_class_get_data_size: "jlGjZyYElnw",
        il2cpp_class_get_static_field_data: "bxMNitXpUhw",
        il2cpp_stats_dump_to_file: "pUWuwXnmMMT",
        il2cpp_stats_get_value: "OLPbSPTMVwv",
        il2cpp_domain_get: "tLey_byAuCr",
        il2cpp_domain_get_assemblies: "CHQKyxBDcWb",
        il2cpp_raise_exception: "lKppny_OxmQ",
        il2cpp_exception_from_name_msg: "ZVyOkbGnPll",
        il2cpp_get_exception_argument_null: "yHevbYuoGuX",
        il2cpp_format_exception: "EvcTsrexjyt",
        il2cpp_format_stack_trace: "eWmObFuARna",
        il2cpp_unhandled_exception: "aCGcQKEGoND",
        il2cpp_native_stack_trace: "myFYtAgmaob",
        il2cpp_field_get_flags: "nNEzqFUZohl",
        il2cpp_field_get_from_reflection: "XfIDJDMmswZ",
        il2cpp_field_get_name: "XgdGXbPhZKQ",
        il2cpp_field_get_parent: "MbchVIcGlyj",
        il2cpp_field_get_object: "lkCurfwbERp",
        il2cpp_field_get_offset: "uUClWOpgxoL",
        il2cpp_field_get_type: "kNhkhMmfZrd",
        il2cpp_field_get_value: "NoceLlJxDAt",
        il2cpp_field_get_value_object: "u_WkvmOAVjE",
        il2cpp_field_has_attribute: "Zp_SUAzEzUA",
        il2cpp_field_set_value: "YmRHzWPZAzB",
        il2cpp_field_static_get_value: "l_nERuHfGqJ",
        il2cpp_field_static_set_value: "HpWJnjHTVGo",
        il2cpp_field_set_value_object: "ucwYfkdy_sS",
        il2cpp_field_is_literal: "HKqLOzsvbJc",
        il2cpp_gc_collect: "pIJe_NRWAqP",
        il2cpp_gc_collect_a_little: "lvewJpbuKkZ",
        il2cpp_gc_start_incremental_collection: "eAuDArnVHSa",
        il2cpp_gc_disable: "XXhrzwpLVjT",
        il2cpp_gc_enable: "ApYOQcvrMtC",
        il2cpp_gc_is_disabled: "EOjCSRnWJYw",
        il2cpp_gc_set_mode: "GCJGsTNJJVY",
        il2cpp_gc_get_max_time_slice_ns: "DLkBKraFlfE",
        il2cpp_gc_set_max_time_slice_ns: "oXjbmrnbTKs",
        il2cpp_gc_is_incremental: "qwWNHSjtROn",
        il2cpp_gc_get_used_size: "DvygtudduLM",
        il2cpp_gc_get_heap_size: "nPsZRdqEvFS",
        il2cpp_gc_wbarrier_set_field: "BKYWBGYoKex",
        il2cpp_gc_has_strict_wbarriers: "EhErDPUCUxq",
        il2cpp_gc_set_external_allocation_tracker: "NOQlODMmaUA",
        il2cpp_gc_set_external_wbarrier_tracker: "cecMDwHpMuH",
        il2cpp_gc_foreach_heap: "_vUUYKavlAx",
        il2cpp_stop_gc_world: "wIixYoGmsXR",
        il2cpp_start_gc_world: "nweHjAgaCqP",
        il2cpp_gc_alloc_fixed: "EsEfKrjedHW",
        il2cpp_gc_free_fixed: "catRugpGkVo",
        il2cpp_gchandle_new: "DuxLxjyqFJf",
        il2cpp_gchandle_new_weakref: "yjxHgrQZUun",
        il2cpp_gchandle_get_target: "bNQcLHiuNPP",
        il2cpp_gchandle_free: "A_HpGTBEZQx",
        il2cpp_gchandle_foreach_get_target: "JxzDWMeixv_",
        il2cpp_object_header_size: "DorFJLsijUj",
        il2cpp_array_object_header_size: "bpxaVNCQzTg",
        il2cpp_offset_of_array_length_in_array_object_header: "Cg_ZmcCtQFq",
        il2cpp_offset_of_array_bounds_in_array_object_header: "EKqawmsBZdd",
        il2cpp_allocation_granularity: "pFNuVaqVBod",
        il2cpp_unity_liveness_allocate_struct: "yjtnmtBoVPd",
        il2cpp_unity_liveness_calculation_from_root: "BqQWuSZpatq",
        il2cpp_unity_liveness_calculation_from_statics: "nPNwPUHVGri",
        il2cpp_unity_liveness_finalize: "IqcGObWmLWO",
        il2cpp_unity_liveness_free_struct: "KfYSavuYJyI",
        il2cpp_method_get_return_type: "aaWEnlPFRYs",
        il2cpp_method_get_declaring_type: "bfqoWNORHRR",
        il2cpp_method_get_name: "joWPBcILtQV",
        il2cpp_method_get_from_reflection: "aankqvLYPgc",
        il2cpp_method_get_object: "dPMRKZwNslM",
        il2cpp_method_is_generic: "UOdejtNfvFn",
        il2cpp_method_is_inflated: "mIvOUjJQbsN",
        il2cpp_method_is_instance: "gJBcUntemXT",
        il2cpp_method_get_param_count: "vKUVJQCUuIB",
        il2cpp_method_get_param: "oskNHSyoXjV",
        il2cpp_method_get_class: "qrvCPpGx_jZ",
        il2cpp_method_has_attribute: "IHIshimxDIr",
        il2cpp_method_get_flags: "wjXYpvWgOWq",
        il2cpp_method_get_token: "vhsunyVbTDm",
        il2cpp_method_get_param_name: "joNYhkugUBc",
        il2cpp_property_get_flags: "IkcloFjmaPV",
        il2cpp_property_get_get_method: "tnwaXtNcKAQ",
        il2cpp_property_get_set_method: "EPdppZiGQkO",
        il2cpp_property_get_name: "jJYepphtAhb",
        il2cpp_property_get_parent: "hpJbsKuSysh",
        il2cpp_object_get_class: "GoCbTGHKOhh",
        il2cpp_object_get_size: "ToqfleZmjrd",
        il2cpp_object_get_virtual_method: "dSSKYlGdgTH",
        il2cpp_object_new: "yFAbqfWaTMv",
        il2cpp_object_unbox: "tHudagrzvsf",
        il2cpp_value_box: "QExVzxgEtGa",
        il2cpp_monitor_enter: "tkoOeKdxxrA",
        il2cpp_monitor_try_enter: "oUfbhBLXQPo",
        il2cpp_monitor_exit: "ufSKgJjblAk",
        il2cpp_monitor_pulse: "xsJcCZftUpQ",
        il2cpp_monitor_pulse_all: "cykqNgCYIYv",
        il2cpp_monitor_wait: "FKllNeMLVnG",
        il2cpp_monitor_try_wait: "qKMIpJyePXB",
        il2cpp_runtime_invoke: "aIlvjmSntxD",
        il2cpp_runtime_invoke_convert_args: "wBGAXgRCUHM",
        il2cpp_runtime_class_init: "KDer_hISkFU",
        il2cpp_runtime_object_init: "VgcWkyXaQMS",
        il2cpp_runtime_object_init_exception: "hEyfH_IWNol",
        il2cpp_runtime_unhandled_exception_policy_set: "mmxzIilZFOl",
        il2cpp_string_length: "ML_neZwTzSH",
        il2cpp_string_chars: "zORdLNUnSfO",
        il2cpp_string_new: "QCPkbRCnSuK",
        il2cpp_string_new_len: "lTIqBgNlFuM",
        il2cpp_string_new_utf16: "NnRCKqkWDIm",
        il2cpp_string_new_wrapper: "AUkxNIfDNmx",
        il2cpp_string_intern: "ENjeZbNyaSx",
        il2cpp_string_is_interned: "FyzsryZwS_w",
        il2cpp_thread_current: "PvVChHNsrpB",
        il2cpp_thread_attach: "voeSgGCjrT_",
        il2cpp_thread_detach: "_hVbcCYlerH",
        il2cpp_is_vm_thread: "oOgtswCuUBB",
        il2cpp_current_thread_walk_frame_stack: "NcmPPxBOqSl",
        il2cpp_thread_walk_frame_stack: "PSukGTeQqhx",
        il2cpp_current_thread_get_top_frame: "VsYnWBewGxi",
        il2cpp_thread_get_top_frame: "cjRutwotRJ_",
        il2cpp_current_thread_get_frame_at: "UFMUoqJZjiM",
        il2cpp_thread_get_frame_at: "eDXffgucIDt",
        il2cpp_current_thread_get_stack_depth: "fevmTZNGZzQ",
        il2cpp_thread_get_stack_depth: "pwofHGqWtbo",
        il2cpp_override_stack_backtrace: "KxmppGQldDs",
        il2cpp_type_get_object: "JclXQWzPsYT",
        il2cpp_type_get_type: "OveCMqnQxlW",
        il2cpp_type_get_class_or_element_class: "dJalCFaHyJR",
        il2cpp_type_get_name: "RcBbyvZUHLB",
        il2cpp_type_is_byref: "HV_hzBgHseN",
        il2cpp_type_get_attrs: "FnUquQkJoVT",
        il2cpp_type_equals: "JwSEECluUYU",
        il2cpp_type_get_assembly_qualified_name: "wKJxguUbFKP",
        il2cpp_type_get_reflection_name: "yhGDjshlWbl",
        il2cpp_type_is_static: "kPkckBKCEPo",
        il2cpp_type_is_pointer_type: "zArGFzzFkEE",
        il2cpp_image_get_assembly: "PXSSRJWyVgW",
        il2cpp_image_get_name: "TkuzmUyZJaW",
        il2cpp_image_get_filename: "_IwWHNk_iYH",
        il2cpp_image_get_entry_point: "nnWCeCFjcei",
        il2cpp_image_get_class_count: "jKtuKNWhJqg",
        il2cpp_image_get_class: "pwCbSlGgWRk",
        il2cpp_capture_memory_snapshot: "QkeeogExzYx",
        il2cpp_free_captured_memory_snapshot: "izUNAMwGaab",
        il2cpp_set_find_plugin_callback: "KHOWohkEKBX",
        il2cpp_register_log_callback: "RghncHNuupk",
        il2cpp_debugger_set_agent_options: "RHXjLHoTqHb",
        il2cpp_is_debugger_attached: "QkESuRpbxBN",
        il2cpp_register_debugger_agent_transport: "SPypOKRhdmg",
        il2cpp_debug_foreach_method: "aDKWdTeUAjt",
        il2cpp_debug_get_method_info: "KKFCQThuOnM",
        il2cpp_unity_install_unitytls_interface: "uVzXCZlXIoW",
        il2cpp_custom_attrs_from_class: "QGEsfdCDhXu",
        il2cpp_custom_attrs_from_method: "VLkJtAlmxwX",
        il2cpp_custom_attrs_from_field: "KlbTG_qQAMU",
        il2cpp_custom_attrs_get_attr: "cgPdShLaUDy",
        il2cpp_custom_attrs_has_attr: "crnHemLfcyz",
        il2cpp_custom_attrs_construct: "EhussJrnUPb",
        il2cpp_custom_attrs_free: "cKngCvcxpqt",
        il2cpp_class_set_userdata: "PopCmJLNzgt",
        il2cpp_class_get_userdata_offset: "xYwkBLDAccI",
        il2cpp_set_default_thread_affinity: "E_gTUdKRnGT",
        il2cpp_unity_set_android_network_up_state_func: "qeTQ_x_xBcu",
        il2cpp_domain_assembly_open: "NubfXFW_B_n",
    };

      const symbols = (Il2Cpp as any).$config.exports;
      if (symbols) {
        for (const key in symbols) {
          if (mapping[key]) {
            symbols[mapping[key]] = symbols[key];
          }
        }
      }

  Il2Cpp.perform(() => {
    const findClass = (n: string) => {
      for (const a of Il2Cpp.domain.assemblies) {
        try {
          const k = a.image.tryClass(n);
          if (k) return k;
        } catch (_) {}
      }
      return null;
    };

    const AppUtils = findClass("AnimalCompany.AppUtils");
    if (!AppUtils) {
      console.log("[-] AppUtils not found");
      return;
    }

    let method: any = null;
    for (const m of AppUtils.methods) {
      if (
        /CalculatePhotonAppVersion/i.test(m.name) &&
        (m.returnType?.name || "") === "System.String"
      ) {
        method = m;
        break;
      }
    }

    if (!method) {
      console.log("[-] CalculatePhotonAppVersion not found");
      return;
    }

    Interceptor.attach(method.virtualAddress, {
      onEnter(args: any) {
        try {
          args[2] = ptr(QUEST_PLATFORM);
        } catch (_) {}
      },
    });
  });
    } catch (e) {
      console.log("[-] Error: " + e);
    }
  }
}
// insert rat here because im totally byte 
loadQuestServers();