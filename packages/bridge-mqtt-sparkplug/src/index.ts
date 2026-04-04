export {
  SPARKPLUG_NAMESPACE_PREFIX,
  parseSparkplugTopic,
  sparkplugTopicToResourceUri,
  sparkplugActionForMessageType,
  defaultTierForSparkplug,
  suggestTierForSparkplugTopic,
  MQTT_SPARKPLUG_BRIDGE_PROFILE,
} from "./sparkplug-resource-mapper.js";

export type {
  SparkplugMessageType,
  SparkplugTopicParts,
} from "./sparkplug-resource-mapper.js";
