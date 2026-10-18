package sheepfromheaven.screenspec.runtime.entity;

import java.util.ArrayList;
import java.util.List;

/**
 * One custom mob from the webapp's "Entity Models" tab — an entry of
 * {@code assets/<modid>/screenspec/elements/entities.json}. Geometry and animations arrive
 * already converted to Java model space by the webapp (the same data its Java model/animation
 * class exporter prints), so the runtime only has to build them. Must stay in sync with
 * webapp/lib/elements/modelKind.ts.
 */
public class EntitySpec {
    public String id;
    public String displayName = "";
    /** path under assets/<modid>/, e.g. "textures/entity/rail_gnawer.png" */
    public String texture = "";
    public int textureWidth = 64;
    public int textureHeight = 64;
    public List<Part> parts = new ArrayList<>();
    public List<Animation> animations = new ArrayList<>();

    /** creature | monster | ambient | water_creature | water_ambient | misc */
    public String mobCategory = "creature";
    /** passive | neutral | hostile_melee | stationary */
    public String behavior = "passive";
    public double maxHealth = 20;
    public double movementSpeed = 0.25;
    public double attackDamage = 3;
    public double armor = 0;
    public double knockbackResistance = 0;
    public double followRange = 16;
    public float hitboxWidth = 0.6f;
    public float hitboxHeight = 1.8f;
    /** damage type id used for melee attacks, e.g. "minecraft:mob_attack" or "mymod:zap" */
    public String damageType = "minecraft:mob_attack";
    public int xpReward = 5;
    public boolean fireImmune;
    public boolean spawnEgg = true;
    public boolean naturalSpawn;
    public String idleAnimation = "";
    public String walkAnimation = "";
    public String attackAnimation = "";
    /** items rolled each time the mob takes damage; death drops use the loot table data/<modid>/loot_table/entities/<id>.json */
    public List<HurtDrop> hurtDrops = new ArrayList<>();

    public static class HurtDrop {
        /** item id, e.g. "minecraft:feather" */
        public String item;
        public int min = 1, max = 1;
        /** 0–1, per hit */
        public double chance = 0.25;
        /** only when the damage comes from a player */
        public boolean playerOnly;
    }

    public static class Part {
        public String name;
        /** parent part name, or null for a child of the root */
        public String parent;
        public Pose pose = new Pose();
        public List<Cube> cubes = new ArrayList<>();
    }

    public static class Pose {
        public float x, y, z, rx, ry, rz;
    }

    public static class Cube {
        public int u, v;
        public boolean mirror;
        public float x, y, z, w, h, d, inflate;
    }

    public static class Animation {
        public String name;
        public float length;
        public boolean looping;
        public List<Channel> channels = new ArrayList<>();
    }

    public static class Channel {
        public String bone;
        /** rotation | position | scale */
        public String target;
        public List<Key> keyframes = new ArrayList<>();
    }

    public static class Key {
        public float time, x, y, z;
        /** linear | catmullrom */
        public String interpolation = "linear";
    }
}
