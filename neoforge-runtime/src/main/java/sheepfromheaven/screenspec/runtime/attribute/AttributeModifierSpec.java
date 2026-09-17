package sheepfromheaven.screenspec.runtime.attribute;

/**
 * Mirrors the webapp's {@code AttributeModifierSpec} (see {@code webapp/lib/types.ts}) — a
 * declarative stat modifier (attack damage, armor, movement speed, ...), matching vanilla's
 * data-driven {@code AttributeModifiers} item component. Not a scripted power/trigger system.
 * Shared by items ({@code ItemSpec.attributes}) and effects ({@code EffectSpec.attributes}) — see
 * {@link AttributeResolver} for how {@link #attribute} is resolved to a real vanilla or
 * project-defined attribute.
 */
public final class AttributeModifierSpec {
    /** e.g. {@code "generic.attack_damage"} — see {@link AttributeResolver} for the resolved set. */
    public String attribute;
    public double amount;
    /** {@code "add_value" | "add_multiplied_base" | "add_multiplied_total"} */
    public String operation = "add_value";
    /** Equipment slot group this modifier applies in, e.g. {@code "chest"} or {@code "any"}. */
    public String slot = "any";
}
