// @ts-nocheck
declare const ptr: any;
declare const Interceptor: any;
declare const Module: any;
declare const Memory: any;
declare const NativeFunction: any;
declare const Script: any;

const QUEST_PLATFORM = 1;
const SYMBOLS_URL = "https://pastebin.com/raw/491iMbh5";

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
        il2cpp_init: "jXIbYUVIqQP",
        il2cpp_init_utf16: "SrSFfUYEqHk",
        il2cpp_shutdown: "zDPIEeJmrEr",
        il2cpp_set_config_dir: "KVBtAYWVLDN",
        il2cpp_set_data_dir: "MDuQYO_wMRA",
        il2cpp_set_temp_dir: "xfBpCaGNOW_",
        il2cpp_set_commandline_arguments: "oWqODxIsxKG",
        il2cpp_set_commandline_arguments_utf16: "MBTfFvCuFTk",
        il2cpp_set_config_utf16: "TYrNvda_Rmb",
        il2cpp_set_config: "nHSPbUlwQvk",
        il2cpp_set_memory_callbacks: "GBxZNjZeAXB",
        il2cpp_memory_pool_set_region_size: "gsdSGS_jsmw",
        il2cpp_memory_pool_get_region_size: "riGPDU_LSnT",
        il2cpp_get_corlib: "HmzMEMupouA",
        il2cpp_add_internal_call: "CPItzCQzAfN",
        il2cpp_resolve_icall: "JylsrSELKpJ",
        il2cpp_alloc: "jtoZYzvJNeP",
        il2cpp_free: "quqNUsWseIw",
        il2cpp_array_class_get: "iPiUj_NnTva",
        il2cpp_array_length: "UWkQjphkJtj",
        il2cpp_array_get_byte_length: "Z_REplaSZkx",
        il2cpp_array_new: "wCrbcQAhNAO",
        il2cpp_array_new_specific: "SiIKqqOmcce",
        il2cpp_array_new_full: "DqprWNjjxTd",
        il2cpp_bounded_array_class_get: "HInCpZLFWLZ",
        il2cpp_array_element_size: "JhG_JTKLgQz",
        il2cpp_assembly_get_image: "YxluOkfhsnW",
        il2cpp_class_for_each: "DzKibDOtmBM",
        il2cpp_class_enum_basetype: "KcNrypGNzFJ",
        il2cpp_class_is_inited: "zsTVDhLyzkF",
        il2cpp_class_is_generic: "cRcqiXGM_Qx",
        il2cpp_class_is_inflated: "sZySsJLHJEI",
        il2cpp_class_is_assignable_from: "lJJwwBXoOvh",
        il2cpp_class_is_subclass_of: "tRemtHGJGho",
        il2cpp_class_has_parent: "fmJsWgEl_JB",
        il2cpp_class_from_il2cpp_type: "GaHCGasmKjz",
        il2cpp_class_from_name: "zhMkJHNiQKY",
        il2cpp_class_from_system_type: "XbQigghLbFm",
        il2cpp_class_get_element_class: "KDLMgeRoRMX",
        il2cpp_class_get_events: "YYAKYhbxdbx",
        il2cpp_class_get_fields: "briHjKzkjop",
        il2cpp_class_get_nested_types: "yHNwBZKBnrR",
        il2cpp_class_get_interfaces: "JlIl_iVIYPT",
        il2cpp_class_get_properties: "wEkcxHcvIYt",
        il2cpp_class_get_property_from_name: "gORVrksHTCb",
        il2cpp_class_get_field_from_name: "yFXdzxqdjvj",
        il2cpp_class_get_methods: "AIuMCO_m_Vr",
        il2cpp_class_get_method_from_name: "VPGfIBxiDtr",
        il2cpp_class_get_name: "JuPyBFEYHuX",
        il2cpp_type_get_name_chunked: "iOpxpHbzVEU",
        il2cpp_class_get_namespace: "uJeqnFJGFGf",
        il2cpp_class_get_parent: "iX_tCflArVP",
        il2cpp_class_get_declaring_type: "WtOYTHJCMjP",
        il2cpp_class_instance_size: "PvnpfWWmFMT",
        il2cpp_class_num_fields: "coPQWmBJLJk",
        il2cpp_class_is_valuetype: "LtcufaRmbMv",
        il2cpp_class_value_size: "SjnwTPBP_SB",
        il2cpp_class_is_blittable: "DTLdNxqxRFv",
        il2cpp_class_get_flags: "fBbDXQ_Drcm",
        il2cpp_class_is_abstract: "ZEXVKGMeaGg",
        il2cpp_class_is_interface: "xRvwNEeNkWa",
        il2cpp_class_array_element_size: "RZRtCiyLCJo",
        il2cpp_class_from_type: "zYXbXrMyCZQ",
        il2cpp_class_get_type: "mtSsQ_HljLe",
        il2cpp_class_get_type_token: "FGUVOB_kAoz",
        il2cpp_class_has_attribute: "wdQDOFsLsBQ",
        il2cpp_class_has_references: "KWlYWBokjfv",
        il2cpp_class_is_enum: "_UhpToulEKm",
        il2cpp_class_get_image: "_UALPKLDS_n",
        il2cpp_class_get_assemblyname: "hq_BiOnEODP",
        il2cpp_class_get_rank: "pdohFUHsWru",
        il2cpp_class_get_data_size: "HZysNqhalHw",
        il2cpp_class_get_static_field_data: "ZGYgLpZIzHa",
        il2cpp_stats_dump_to_file: "_cMgwXTvCvo",
        il2cpp_stats_get_value: "UuklpGgzbPE",
        il2cpp_domain_get: "dexNTjDvNey",
        il2cpp_domain_get_assemblies: "AnEyaFFeaVk",
        il2cpp_raise_exception: "xHAOArcRoHt",
        il2cpp_exception_from_name_msg: "hldTbUnvLSE",
        il2cpp_get_exception_argument_null: "xXYqG_fxRkM",
        il2cpp_format_exception: "HmVEXuEhnBr",
        il2cpp_format_stack_trace: "qmIfEUBmWrW",
        il2cpp_unhandled_exception: "klvdQNbTlxo",
        il2cpp_native_stack_trace: "UuDZLhfmW_m",
        il2cpp_field_get_flags: "_opTQabdeDS",
        il2cpp_field_get_from_reflection: "MS_CNXHAvcE",
        il2cpp_field_get_name: "VKBoPrOIAxG",
        il2cpp_field_get_parent: "DuAcWIPAIad",
        il2cpp_field_get_object: "zupztMaISrs",
        il2cpp_field_get_offset: "_dIpVAWJgPS",
        il2cpp_field_get_type: "SvbtDOTTaP_",
        il2cpp_field_get_value: "arfUQocOMaE",
        il2cpp_field_get_value_object: "K_xBLDFveCC",
        il2cpp_field_has_attribute: "aWsShnATkuI",
        il2cpp_field_set_value: "lmOrNxLJleJ",
        il2cpp_field_static_get_value: "PjkzLPXZuOz",
        il2cpp_field_static_set_value: "rGogdYxgXLI",
        il2cpp_field_set_value_object: "OoNzMfyju_w",
        il2cpp_field_is_literal: "oZcxbgEwtRu",
        il2cpp_gc_collect: "gJhiTVhcXgt",
        il2cpp_gc_collect_a_little: "iYbVMtdIWBG",
        il2cpp_gc_start_incremental_collection: "HBIYgdsGquw",
        il2cpp_gc_disable: "hsyhxgVLtOS",
        il2cpp_gc_enable: "YJdIBaqKxLe",
        il2cpp_gc_is_disabled: "nuIxKrzSDKd",
        il2cpp_gc_set_mode: "sPgCih_kMoE",
        il2cpp_gc_get_max_time_slice_ns: "wamognHiOFC",
        il2cpp_gc_set_max_time_slice_ns: "dcPCH_YRMiK",
        il2cpp_gc_is_incremental: "fNusqAczGBc",
        il2cpp_gc_get_used_size: "BmxGtzaNiJF",
        il2cpp_gc_get_heap_size: "urxe_DMCEXj",
        il2cpp_gc_wbarrier_set_field: "FEaKQuTXSIN",
        il2cpp_gc_has_strict_wbarriers: "CxfFRQ_fPM_",
        il2cpp_gc_set_external_allocation_tracker: "zkoYzPNsYen",
        il2cpp_gc_set_external_wbarrier_tracker: "nzRUlTtRnZW",
        il2cpp_gc_foreach_heap: "iIaSadmfsxe",
        il2cpp_stop_gc_world: "DSnBKUJGNTV",
        il2cpp_start_gc_world: "GphncTNRVgX",
        il2cpp_gc_alloc_fixed: "JxqispG_WIe",
        il2cpp_gc_free_fixed: "_XTpjVLyVUx",
        il2cpp_gchandle_new: "IMMLYjVCYFg",
        il2cpp_gchandle_new_weakref: "YqsrETdJebB",
        il2cpp_gchandle_get_target: "qNZPlifxVid",
        il2cpp_gchandle_free: "_zPeYtqhJYY",
        il2cpp_gchandle_foreach_get_target: "vcoEwAxsozA",
        il2cpp_object_header_size: "eAMJaKLAWeX",
        il2cpp_array_object_header_size: "TrlvArcJyQX",
        il2cpp_offset_of_array_length_in_array_object_header: "_zdBIjyMUel",
        il2cpp_offset_of_array_bounds_in_array_object_header: "qxZZBSpEpay",
        il2cpp_allocation_granularity: "WvnJaIYOCCH",
        il2cpp_unity_liveness_allocate_struct: "vzVCsBqZKra",
        il2cpp_unity_liveness_calculation_from_root: "_bhbmfCQyKB",
        il2cpp_unity_liveness_calculation_from_statics: "shwFrkuMVTD",
        il2cpp_unity_liveness_finalize: "WtHqOseegcH",
        il2cpp_unity_liveness_free_struct: "TkBihC_jzeU",
        il2cpp_method_get_return_type: "RbEBOhiJVLy",
        il2cpp_method_get_declaring_type: "NBArcApK_ah",
        il2cpp_method_get_name: "reVcJYTGbOx",
        il2cpp_method_get_from_reflection: "SiYDXyPmqHm",
        il2cpp_method_get_object: "ISNQfZIdahk",
        il2cpp_method_is_generic: "IamTWZUOewG",
        il2cpp_method_is_inflated: "nhKegcmlvTv",
        il2cpp_method_is_instance: "iTEk_MsloyT",
        il2cpp_method_get_param_count: "TjAhRZpcpXp",
        il2cpp_method_get_param: "uvKQmhOiUMp",
        il2cpp_method_get_class: "suwMGnWFoMb",
        il2cpp_method_has_attribute: "TYK_sGURTUI",
        il2cpp_method_get_flags: "xYqcFOnLtuY",
        il2cpp_method_get_token: "IF_BEXDjcxU",
        il2cpp_method_get_param_name: "ncHvMOkBnDz",
        il2cpp_property_get_flags: "SDVfhCYeqpg",
        il2cpp_property_get_get_method: "vKCNzvnPHLG",
        il2cpp_property_get_set_method: "eoCFGzIxqtL",
        il2cpp_property_get_name: "SqBCgjzRUOV",
        il2cpp_property_get_parent: "dpfbFXz_IkJ",
        il2cpp_object_get_class: "ZlmOaFsxEwI",
        il2cpp_object_get_size: "rbuMnpWobvG",
        il2cpp_object_get_virtual_method: "uGxAqEfokEm",
        il2cpp_object_new: "wcstXuZALcK",
        il2cpp_object_unbox: "mTCZCUqWYTg",
        il2cpp_value_box: "iDUfiBMoc_M",
        il2cpp_monitor_enter: "CbBNNRSwQeC",
        il2cpp_monitor_try_enter: "itCHVOSwuah",
        il2cpp_monitor_exit: "SNfqcVwKUBW",
        il2cpp_monitor_pulse: "AmbQYNMtvjx",
        il2cpp_monitor_pulse_all: "kfRFYHwksYq",
        il2cpp_monitor_wait: "UNAICQbwxKL",
        il2cpp_monitor_try_wait: "ef_EiEZUJcX",
        il2cpp_runtime_invoke: "KTHIdICyWMo",
        il2cpp_runtime_invoke_convert_args: "UPmPjRqJbGH",
        il2cpp_runtime_class_init: "ZItMFaYYVhL",
        il2cpp_runtime_object_init: "PvUdbYYXFcj",
        il2cpp_runtime_object_init_exception: "aAWQOAqRFZQ",
        il2cpp_runtime_unhandled_exception_policy_set: "sMqweLCViYH",
        il2cpp_string_length: "huVYuqSmDvS",
        il2cpp_string_chars: "ylUqRrkUyXZ",
        il2cpp_string_new: "DhGZEgUOfhw",
        il2cpp_string_new_len: "nIdajvbDWCI",
        il2cpp_string_new_utf16: "PgWUHVWTBks",
        il2cpp_string_new_wrapper: "tSmStHPySxP",
        il2cpp_string_intern: "UavswTIbEjv",
        il2cpp_string_is_interned: "IMFdBBcWDqU",
        il2cpp_thread_current: "FVljUkhPrwt",
        il2cpp_thread_attach: "TTXfdVrrKdp",
        il2cpp_thread_detach: "_ckHYtDokuZ",
        il2cpp_is_vm_thread: "mJlybUkxzFi",
        il2cpp_current_thread_walk_frame_stack: "pSpzKtbhedG",
        il2cpp_thread_walk_frame_stack: "lBsyqPeGbsc",
        il2cpp_current_thread_get_top_frame: "rFyLkIJJZfi",
        il2cpp_thread_get_top_frame: "myw_npdTEIS",
        il2cpp_current_thread_get_frame_at: "YHEweiVPWwQ",
        il2cpp_thread_get_frame_at: "hAmaRROVVDj",
        il2cpp_current_thread_get_stack_depth: "QKdfsCCiOOb",
        il2cpp_thread_get_stack_depth: "SXnsRfOtl_t",
        il2cpp_override_stack_backtrace: "upMexBSIPex",
        il2cpp_type_get_object: "tWKiWSNucip",
        il2cpp_type_get_type: "uKu_TmNxWMg",
        il2cpp_type_get_class_or_element_class: "XYtQyiyrvjX",
        il2cpp_type_get_name: "moWxJ_mSmgM",
        il2cpp_type_is_byref: "hvWtHjaeCKx",
        il2cpp_type_get_attrs: "eOihVwcMOza",
        il2cpp_type_equals: "JXNXVeuTqcm",
        il2cpp_type_get_assembly_qualified_name: "yu_tCDechXS",
        il2cpp_type_get_reflection_name: "yWQnvpxnyxc",
        il2cpp_type_is_static: "PYxUkISgaHE",
        il2cpp_type_is_pointer_type: "GmcSCUjjXmb",
        il2cpp_image_get_assembly: "RabbhJgTRev",
        il2cpp_image_get_name: "hPZCGgsNspk",
        il2cpp_image_get_filename: "UeZzco_oYPE",
        il2cpp_image_get_entry_point: "UZRZYfH_xAg",
        il2cpp_image_get_class_count: "nxzefBnHRZx",
        il2cpp_image_get_class: "AqxBbDPyQT_",
        il2cpp_capture_memory_snapshot: "kcpIpzeXXFe",
        il2cpp_free_captured_memory_snapshot: "rXhKHFODlBH",
        il2cpp_set_find_plugin_callback: "lvKnJkifRzK",
        il2cpp_register_log_callback: "KAJBWMtknEM",
        il2cpp_debugger_set_agent_options: "xaqxTjUgkhq",
        il2cpp_is_debugger_attached: "YKLRqPJfirh",
        il2cpp_register_debugger_agent_transport: "xIfkHaKYZKh",
        il2cpp_debug_foreach_method: "lkNRqeFdGUD",
        il2cpp_debug_get_method_info: "aPinXeAGhEI",
        il2cpp_unity_install_unitytls_interface: "hSxSXzFFzbC",
        il2cpp_custom_attrs_from_class: "foDvOpDxAmi",
        il2cpp_custom_attrs_from_method: "YsTlgJFWUII",
        il2cpp_custom_attrs_from_field: "bVzCRWRMURs",
        il2cpp_custom_attrs_get_attr: "voUkYlDorwm",
        il2cpp_custom_attrs_has_attr: "qLcZKIRNSNm",
        il2cpp_custom_attrs_construct: "bYuJmQbwuSu",
        il2cpp_custom_attrs_free: "SBznjpNmzht",
        il2cpp_class_set_userdata: "KdHWTpbrcHv",
        il2cpp_class_get_userdata_offset: "aVeQpbhVJSE",
        il2cpp_set_default_thread_affinity: "EwDnhaNOXWo",
        il2cpp_unity_set_android_network_up_state_func: "AHRZaFFhwPr",
        il2cpp_domain_assembly_open: "rPfDrbU_fsF",
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