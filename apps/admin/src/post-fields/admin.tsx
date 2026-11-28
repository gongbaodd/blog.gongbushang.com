/**
 * Admin entry of the `post-fields` plugin (GON-269). EmDash resolves `post-fields:hidden` to `fields.hidden` and renders it in place
 * of the default input. Rendering nothing hides the field; the editor keeps the value in its form state, so a save sends it back.
 */
export const HiddenField = () => null;

export const fields = {
	hidden: HiddenField,
};
