/** Tool names the agent calls (mcp/server.mjs) → what the user sees in the log. */
export const TOOL_LABELS: Record<string, string> = {
  get_guide: "Reading the modeling guide", generate_image: "Drawing a picture", generate_item_skin: "Item Skin Generator", generate_gui_texture: "Screen GUI Generator", list_collections: "Looking at the project", describe_collection: "Reading the fields",
  list_records: "Reading entries", list_textures: "Looking for a texture", create_record: "Creating an entry", update_record: "Updating an entry", delete_record: "Deleting an entry",
  list_elements: "Listing elements", list_element_kinds: "Reading element kinds", hold_item: "Putting the item in its hand", get_status: "Checking the editor", create_model: "Creating the model",
  add_bones: "Adding bones", add_cubes: "Adding cubes", edit_element: "Adjusting parts", move_bone: "Moving a bone",
  mirror_element: "Mirroring parts", delete_elements: "Removing parts", pack_uv: "Packing the texture layout",
  paint_cubes: "Painting", paint_texture: "Painting the texture", paint_face: "Painting details",
  create_animation: "Creating an animation", add_keyframes: "Animating", generate_animation: "Generating an animation",
  set_entity_settings: "Setting mob stats", screenshot: "Looking at the result", set_view: "Turning the camera",
  open_element: "Opening the model", get_model: "Inspecting the model", update_element: "Updating", create_element: "Creating an element",
};
