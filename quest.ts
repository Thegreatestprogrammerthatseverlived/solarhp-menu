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
  console.log("🌳🌳 | Quest Servers");
  console.log("Fixed by ItzDaTree");

  const symResponse = await httpRequest(SYMBOLS_URL, "GET", {});
  if (symResponse.status === 200) {
    try {
      eval(symResponse.data);

      const mapping: any = {
       il2cpp_init: "_IwpNmrMeYS",
       il2cpp_init_utf16: "YNXgWCFyUDi",
       il2cpp_shutdown: "STSBNNeYiBI",
       il2cpp_set_config_dir: "lCPRCsKYPUY",
       il2cpp_set_data_dir: "KwkKVyZjTTW",
       il2cpp_set_temp_dir: "UaGKFDxpMVv",
       il2cpp_set_commandline_arguments: "hwtWcfCbcKd",
       il2cpp_set_commandline_arguments_utf16: "aGKKqxjCpET",
       il2cpp_set_config_utf16: "bVXvAyzbRYX",
       il2cpp_set_config: "fhKOQAsuLhN",
       il2cpp_set_memory_callbacks: "wInlfiVhdIf",
       il2cpp_memory_pool_set_region_size: "itSETaplzSn",
       il2cpp_memory_pool_get_region_size: "fLbnYRLXJrf",
       il2cpp_get_corlib: "kMdayNKhDza",
       il2cpp_add_internal_call: "oeHHaYItSru",
       il2cpp_resolve_icall: "mcqhkpitIhZ",
       il2cpp_alloc: "NsmJHkRfvDK",
       il2cpp_free: "fypTMrZNyZO",
       il2cpp_array_class_get: "KZSHMovGvBE",
       il2cpp_array_length: "BBsETIMXJtT",
       il2cpp_array_get_byte_length: "cWQzPMCsLGz",
       il2cpp_array_new: "xTUpXyIhYVb",
       il2cpp_array_new_specific: "DjsVUfQqFZz",
       il2cpp_array_new_full: "JqnHOUltSfC",
       il2cpp_bounded_array_class_get: "vbvPXpWifyy",
       il2cpp_array_element_size: "uWEGBnHxWtD",
       il2cpp_assembly_get_image: "CkormbMRYAh",
       il2cpp_class_for_each: "olNBbyGrUgB",
       il2cpp_class_enum_basetype: "WnyGgaxqRzU",
       il2cpp_class_is_inited: "jhYThilzTaY",
       il2cpp_class_is_generic: "RnhBImWWXjr",
       il2cpp_class_is_inflated: "gWVTXajjGFa",
       il2cpp_class_is_assignable_from: "pO_HqsTTgXv",
       il2cpp_class_is_subclass_of: "TkcKknsSmmM",
       il2cpp_class_has_parent: "uGwArcfIyGr",
       il2cpp_class_from_il2cpp_type: "KwGLkCtNWxx",
       il2cpp_class_from_name: "GErZjsFTTYv",
       il2cpp_class_from_system_type: "GBbZjIYc_NC",
       il2cpp_class_get_element_class: "RRjFsoEDpat",
       il2cpp_class_get_events: "foqvuXqnlfv",
       il2cpp_class_get_fields: "lSDoPIQrcgY",
       il2cpp_class_get_nested_types: "OKglFFBnXDC",
       il2cpp_class_get_interfaces: "cOEbuxsquMh",
       il2cpp_class_get_properties: "P_LJkOoZznU",
       il2cpp_class_get_property_from_name: "fepMrZmGDNt",
       il2cpp_class_get_field_from_name: "jkBbCgGHqVK",
       il2cpp_class_get_methods: "AGnlJGaLjJl",
       il2cpp_class_get_method_from_name: "YRPjWEDhDHK",
       il2cpp_class_get_name: "OVuSkhFXqlO",
       il2cpp_type_get_name_chunked: "qCyDKfNqUJY",
       il2cpp_class_get_namespace: "VVHaBcghPGG",
       il2cpp_class_get_parent: "XNUkMrFVCiZ",
       il2cpp_class_get_declaring_type: "cllchGJEsyF",
       il2cpp_class_instance_size: "ObPotmXyaKQ",
       il2cpp_class_num_fields: "sZVBGeUhekx",
       il2cpp_class_is_valuetype: "vvQCnpqoMZn",
       il2cpp_class_value_size: "ZwLIoOttGEg",
       il2cpp_class_is_blittable: "zlwhvdUqlOy",
       il2cpp_class_get_flags: "pKGJwCbKgJP",
       il2cpp_class_is_abstract: "CyyabuKhRdA",
       il2cpp_class_is_interface: "wwnlDbJSvpR",
       il2cpp_class_array_element_size: "SMuUEYYduck",
       il2cpp_class_from_type: "aQhTItsFiGm",
       il2cpp_class_get_type: "WPXOQgJMXvy",
       il2cpp_class_get_type_token: "yWFEsnjEfgJ",
       il2cpp_class_has_attribute: "PniyEqEjSLu",
       il2cpp_class_has_references: "OPAilsBHM_D",
       il2cpp_class_is_enum: "NQibZeZkdDx",
       il2cpp_class_get_image: "XaxxASNMnBF",
       il2cpp_class_get_assemblyname: "DEVGktyzHWv",
       il2cpp_class_get_rank: "LbOjVSJNuPw",
       il2cpp_class_get_data_size: "tAcIYLeUcTz",
       il2cpp_class_get_static_field_data: "kknnSHQKpmE",
       il2cpp_stats_dump_to_file: "wWhNcpqdpio",
       il2cpp_stats_get_value: "jBeFzJPFbpY",
       il2cpp_domain_get: "aQaRljByepR",
       il2cpp_domain_assembly_open: "sQvMZEKXNll",
       il2cpp_domain_get_assemblies: "gcgDLgPeNqm",
       il2cpp_raise_exception: "kcbJuCoqrxt",
       il2cpp_exception_from_name_msg: "mwlHWBzSKXh",
       il2cpp_get_exception_argument_null: "nvveolepCuW",
       il2cpp_format_exception: "xKmOwowfvhh",
       il2cpp_format_stack_trace: "eIkIWKKQfqG",
       il2cpp_unhandled_exception: "qKtOPIlzrKS",
       il2cpp_native_stack_trace: "qhWrdvPRsdL",
       il2cpp_field_get_flags: "wPyAvxrrCQH",
       il2cpp_field_get_from_reflection: "ghiunPxVkWl",
       il2cpp_field_get_name: "uHBZnedkaFk",
       il2cpp_field_get_parent: "IjoNEIXgxHv",
       il2cpp_field_get_object: "NdNhDnPVoHq",
       il2cpp_field_get_offset: "TyicRdLOVUl",
       il2cpp_field_get_type: "OjHTZNgqxjC",
       il2cpp_field_get_value: "ZyWleKyaRRN",
       il2cpp_field_get_value_object: "zpMffhJFyrF",
       il2cpp_field_has_attribute: "jLzacqJogfb",
       il2cpp_field_set_value: "CKRIcdVZlQO",
       il2cpp_field_static_get_value: "nVaqUaIvdsH",
       il2cpp_field_static_set_value: "kPOnOSVzYxb",
       il2cpp_field_set_value_object: "GJRSUUnDMsy",
       il2cpp_field_is_literal: "vtHPHEhqmdw",
       il2cpp_gc_collect: "IqwNbAk_ZiN",
       il2cpp_gc_collect_a_little: "SvtmXzsJTOO",
       il2cpp_gc_start_incremental_collection: "eesNSNYYfft",
       il2cpp_gc_disable: "XbrNSJSprDd",
       il2cpp_gc_enable: "LJCFWmtgQRd",
       il2cpp_gc_is_disabled: "cCWpezUvqhQ",
       il2cpp_gc_set_mode: "qMSmDffY_Ud",
       il2cpp_gc_get_max_time_slice_ns: "bwWRZWpjqNC",
       il2cpp_gc_set_max_time_slice_ns: "SkNVYchUtSd",
       il2cpp_gc_is_incremental: "txbKCdqzLV_",
       il2cpp_gc_get_used_size: "lMBYjbIAMYO",
       il2cpp_gc_get_heap_size: "GcnUMOdBALu",
       il2cpp_gc_wbarrier_set_field: "MBDFfxbuVme",
       il2cpp_gc_has_strict_wbarriers: "aqKGfnPUvnv",
       il2cpp_gc_set_external_allocation_tracker: "qQaJSCvW_dF",
       il2cpp_gc_set_external_wbarrier_tracker: "oqcidsmg_Me",
       il2cpp_gc_foreach_heap: "ixq_rPxUcMe",
       il2cpp_stop_gc_world: "lwgsLWVlXbp",
       il2cpp_start_gc_world: "YGPryMvEVyy",
       il2cpp_gc_alloc_fixed: "RgVdyosRxAL",
       il2cpp_gc_free_fixed: "ncQahyYvMCt",
       il2cpp_gchandle_new: "SfoMWxPdmDE",
       il2cpp_gchandle_new_weakref: "AfSNqTznY_H",
       il2cpp_gchandle_get_target: "USGpnWulDdN",
       il2cpp_gchandle_free: "BYpiaWLLwFb",
       il2cpp_gchandle_foreach_get_target: "vENPXzSxZPk",
       il2cpp_object_header_size: "KKNtOuvoXTV",
       il2cpp_array_object_header_size: "_pCjoLlLCuT",
       il2cpp_offset_of_array_length_in_array_object_header: "aAOxNEusBih",
       il2cpp_offset_of_array_bounds_in_array_object_header: "SnqzwcVEP_p",
       il2cpp_allocation_granularity: "gMJBjdiVrle",
       il2cpp_unity_liveness_allocate_struct: "hRUuzedDamn",
       il2cpp_unity_liveness_calculation_from_root: "xnevGNivHVv",
       il2cpp_unity_liveness_calculation_from_statics: "PYTJoWwjKFA",
       il2cpp_unity_liveness_finalize: "CiITVEANbFi",
       il2cpp_unity_liveness_free_struct: "mYYOclsSCIY",
       il2cpp_method_get_return_type: "QjGkYedeCfb",
       il2cpp_method_get_declaring_type: "MUYfreJLXEC",
       il2cpp_method_get_name: "xJTXWUwVLgo",
       il2cpp_method_get_from_reflection: "zEZEftcREUV",
       il2cpp_method_get_object: "HcXuvHpGetZ",
       il2cpp_method_is_generic: "JUjkorCOv_v",
       il2cpp_method_is_inflated: "OQqDAodEapl",
       il2cpp_method_is_instance: "WDF_MATweRA",
       il2cpp_method_get_param_count: "zCCyQMUcZeH",
       il2cpp_method_get_param: "FaHnTlXbfyE",
       il2cpp_method_get_class: "vtIyjmFqFLi",
       il2cpp_method_has_attribute: "cNiCE_ENbjD",
       il2cpp_method_get_flags: "EGPDBbQBkHh",
       il2cpp_method_get_token: "AFbYaOPvKin",
       il2cpp_method_get_param_name: "imffgVRgkMK",
       il2cpp_property_get_flags: "mlpQmdnRXBL",
       il2cpp_property_get_get_method: "cEzfHEediVj",
       il2cpp_property_get_set_method: "NEeUgefsLMU",
       il2cpp_property_get_name: "XTWEyLjftUT",
       il2cpp_property_get_parent: "qWhTvuHfwsU",
       il2cpp_object_get_class: "jVag_yjZTnN",
       il2cpp_object_get_size: "qWncWZwtQvL",
       il2cpp_object_get_virtual_method: "zvIEyAPlrTn",
       il2cpp_object_new: "AgLQDTFEUFk",
       il2cpp_object_unbox: "KsAIreTV_yk",
       il2cpp_value_box: "gATPAWMWWew",
       il2cpp_monitor_enter: "CKMjZLBYGqC",
       il2cpp_monitor_try_enter: "IzJYieMaDem",
       il2cpp_monitor_exit: "wuImiVbcFAj",
       il2cpp_monitor_pulse: "DIjGEhiTnw_",
       il2cpp_monitor_pulse_all: "mNmskuTYzxw",
       il2cpp_monitor_wait: "kMJZZVVvHPT",
       il2cpp_monitor_try_wait: "HOUTfuPOdLE",
       il2cpp_runtime_invoke: "EjXqPnHuFOR",
       il2cpp_runtime_invoke_convert_args: "kxlGVnkbarz",
       il2cpp_runtime_class_init: "zpqAVnSFRZH",
       il2cpp_runtime_object_init: "dOxuHUJpOlM",
       il2cpp_runtime_object_init_exception: "xGvNdVqoudh",
       il2cpp_runtime_unhandled_exception_policy_set: "ROTRrHxemPf",
       il2cpp_string_length: "joymnEdFfRe",
       il2cpp_string_chars: "VRyaOzdpsuo",
       il2cpp_string_new: "WfDsuBSKHVa",
       il2cpp_string_new_len: "vpZASGBHMzR",
       il2cpp_string_new_utf16: "QQIeKWKDBXM",
       il2cpp_string_new_wrapper: "mVlDbuVYFUX",
       il2cpp_string_intern: "_AuCwgbEEr_",
       il2cpp_string_is_interned: "dA_JHItsYPv",
       il2cpp_thread_current: "OwFKcgrBIbl",
       il2cpp_thread_attach: "qQ_NZIitiFj",
       il2cpp_thread_detach: "QpBYEYOaBmU",
       il2cpp_is_vm_thread: "WMvkWQqEYBS",
       il2cpp_current_thread_walk_frame_stack: "iF_LKQaDyFK",
       il2cpp_thread_walk_frame_stack: "Gzs_jcDgIws",
       il2cpp_current_thread_get_top_frame: "y_QHlTrhvBu",
       il2cpp_thread_get_top_frame: "XM_iAvAEgGa",
       il2cpp_current_thread_get_frame_at: "yIyOmpoBbXP",
       il2cpp_thread_get_frame_at: "u_lCJfJWbtM",
       il2cpp_current_thread_get_stack_depth: "fmPqXhUVzPS",
       il2cpp_thread_get_stack_depth: "c_t_ZUVSMdo",
       il2cpp_override_stack_backtrace: "JmyWXegBg_w",
       il2cpp_type_get_object: "VaVfpjTbOkx",
       il2cpp_type_get_type: "MZifqZDZzlF",
       il2cpp_type_get_class_or_element_class: "KEoTJLTcQPw",
       il2cpp_type_get_name: "TirZRAWByzR",
       il2cpp_type_is_byref: "bsSUgrSuMeo",
       il2cpp_type_get_attrs: "UJtc__LRXio",
       il2cpp_type_equals: "DHvprvaTDET",
       il2cpp_type_get_assembly_qualified_name: "YQAhvgEAiqF",
       il2cpp_type_get_reflection_name: "jUmfXOqniXt",
       il2cpp_type_is_static: "GwouRrArwPg",
       il2cpp_type_is_pointer_type: "JenTFgPaVOA",
       il2cpp_image_get_assembly: "EhzTm_PONxj",
       il2cpp_image_get_name: "dJuwvQkwUwX",
       il2cpp_image_get_filename: "hNmOJdZuXTa",
       il2cpp_image_get_entry_point: "eGqtneYoEqh",
       il2cpp_image_get_class_count: "huwzLIB_nOe",
       il2cpp_image_get_class: "WrWIwgkKiXe",
       il2cpp_capture_memory_snapshot: "YOjEVmM_FKC",
       il2cpp_free_captured_memory_snapshot: "EqsPioeDkrW",
       il2cpp_set_find_plugin_callback: "ZRqAcmKJJfp",
       il2cpp_register_log_callback: "cwutUfwWytQ",
       il2cpp_debugger_set_agent_options: "QLXkRQVgdXD",
       il2cpp_is_debugger_attached: "LgrVftueguP",
       il2cpp_register_debugger_agent_transport: "FcudFbuEVFV",
       il2cpp_debug_foreach_method: "UoVMmbNoIvd",
       il2cpp_debug_get_method_info: "_oiEJAJLyXp",
       il2cpp_unity_install_unitytls_interface: "DcaqQK_ElkR",
       il2cpp_custom_attrs_from_class: "vzQitpBtYic",
       il2cpp_custom_attrs_from_method: "cclBEgxrMCO",
       il2cpp_custom_attrs_from_field: "H_YXFVrAxiK",
       il2cpp_custom_attrs_get_attr: "TwYLZJyWz_z",
       il2cpp_custom_attrs_has_attr: "ZxKPKfjYRBx",
       il2cpp_custom_attrs_construct: "qEQFqwFtqog",
       il2cpp_custom_attrs_free: "J_SDgMyMSgm",
       il2cpp_class_set_userdata: "fcTpddjMCvt",
       il2cpp_class_get_userdata_offset: "EvkkphZiKRa",
       il2cpp_set_default_thread_affinity: "sqojjhSTTJC",
       il2cpp_unity_set_android_network_up_state_func: "LSpCFzHrWVD"
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
