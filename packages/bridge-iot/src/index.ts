/**
 * SINT Protocol — @sint/bridge-iot
 *
 * MQTT/CoAP edge IoT bridge for constrained devices.
 * Targets industrial sensors, actuators, and edge gateways.
 */

export {
  mqttTopicToResourceUri,
  coapToResourceUri,
  defaultTierForMqttTopic,
  defaultTierForCoapMethod,
  isSafetyCriticalIotTopic,
  parseIotResourceUri,
} from "./iot-resource-mapper.js";

export type {
  IotProtocol,
  IotQos,
  MqttTopicInfo,
  CoapRequestInfo,
} from "./iot-resource-mapper.js";

export { MqttGatewaySession, MqttAuthorizationError } from "./mqtt-session.js";
export type {
  MqttClientAdapter,
  MqttGatewaySessionConfig,
  GatewayLike,
} from "./mqtt-session.js";
